// Runner NOTURNO da correcao de geocode por alvo (ver
// scripts/corrigir-geocode-por-alvo.ts), um dia atras do dia rodado.
//
// Uso: npx tsx --env-file=.env.production scripts/correcao-geocode-noturna.ts [AAAA-MM-DD]
// Sem argumento: usa "ontem" no fuso de Brasilia. Com argumento: usa a data
// passada (util pra rodar manualmente/reprocessar um dia especifico).
//
// Fluxo: acha a geracao mais recente do KPI da Nutry Max (tabela
// kpi_romaneio_geracoes) pra aquela data_referencia que tenha o Romaneio
// original guardado no Storage, baixa o PDF, roda a logica de sugestao
// (rodarCorrecao SEMPRE com aplicar: false) e escreve os CSVs em
// relatorios-geocode/<data>/.
//
// Padrao: SO' RELATORIO. Com GEOCODE_NOTURNO_APLICAR=1 no ambiente, grava no
// kpi_romaneio_geocode_cache APENAS a regra forte (cadastro Unitrac
// confirmado por parada GPS da propria placa -- sugerirCadastroUnitrac, a
// mesma aplicada a mao em 22-23/09), fonte 'cadastro_unitrac'. A regra
// 'parada_alvo' continua so' no CSV. Guardas (aplicarCadastroNoturno):
//   - teto de TETO_CORRECOES_NOITE por noite: acima disso nao grava NADA;
//   - nunca sobrescreve fonte manual / verificacao_manual / cadastro_unitrac
//     (conferido no estado ATUAL do cache, relido na hora de gravar);
//   - coordenada fora da caixa do RJ -> pula e loga;
//   - backup-antes-aplicar.csv escrito ANTES do primeiro upsert;
//   - erro em qualquer upsert -> para, loga o que ja' gravou, sai com 1.
//
// Sem geracao pra aquele dia: loga e sai com codigo 0 (nao e' erro -- so'
// nao rodou o KPI naquele dia). Qualquer outra falha (download, parse,
// etc.) sai com codigo 1.
import path from 'path'
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { createServiceClient } from '../src/lib/supabase/service'
import { hojeBR } from '../src/lib/data-br'
import { rodarCorrecao, montarUpsertCadastro, csvBackupCache } from './corrigir-geocode-por-alvo'
import { coordenadaValidaRj, type LinhaCacheAtual } from './aplicar-correcoes-geocode'
import type { SugestaoCadastro } from '../src/lib/kpi-romaneio/cadastro-unitrac'
import { chaveCacheEndereco } from '../src/lib/kpi-romaneio/endereco-cep'
import { enderecosParaLerCache } from '../src/lib/kpi-romaneio/geocode'

const CLIENTE = 'nutrimax'
const BUCKET = 'kpi-romaneio-inputs'

/** Subtrai um dia de calendario de uma data AAAA-MM-DD (pura, sem fuso --
 *  a data ja e' um dia de calendario, nao um instante). Usa UTC internamente
 *  so' pra deixar o Date fazer a aritmetica de virada de mes/ano por nos. */
export function diaAnterior(dataISO: string): string {
  const [ano, mes, dia] = dataISO.split('-').map(Number)
  const dt = new Date(Date.UTC(ano, mes - 1, dia))
  dt.setUTCDate(dt.getUTCDate() - 1)
  return dt.toISOString().slice(0, 10)
}

export type GeracaoRow = { id: string; gerado_em: string; romaneio_storage_path: string | null }

/** Entre as geracoes de um mesmo dia (pode ter mais de uma -- regeracao
 *  manual, reprocessamento), escolhe a mais recente (gerado_em) que tenha
 *  o Romaneio original guardado. Geracoes antigas sem o PDF guardado
 *  (romaneio_storage_path null) nao servem -- nao da pra rodar a correcao
 *  sem o PDF. Sem nenhuma geracao utilizavel, retorna null. */
export function escolherGeracao(rows: GeracaoRow[]): GeracaoRow | null {
  const utilizaveis = rows.filter(r => r.romaneio_storage_path != null)
  if (utilizaveis.length === 0) return null
  return utilizaveis.reduce((melhor, r) => (r.gerado_em > melhor.gerado_em ? r : melhor))
}

export const TETO_CORRECOES_NOITE = 30
export const FONTES_PROTEGIDAS: ReadonlySet<string> = new Set(['manual', 'verificacao_manual', 'cadastro_unitrac'])
const TABELA_CACHE = 'kpi_romaneio_geocode_cache'
const ARQUIVO_BACKUP = 'backup-antes-aplicar.csv'

export function aplicarHabilitado(env: Record<string, string | undefined>): boolean {
  return env.GEOCODE_NOTURNO_APLICAR === '1'
}

type UpsertCadastro = ReturnType<typeof montarUpsertCadastro>
export type PuladoNoturno = { endereco: string; motivo: 'fonte_protegida' | 'fora_do_rj' }

/** Filtra as sugestoes da regra forte contra o estado ATUAL do cache e aplica o
 *  teto. O teto conta o lote que de fato seria gravado (depois das protecoes);
 *  acima dele o lote volta vazio -- nao grava nada, revisao manual. */
export function montarLoteNoturno(
  sugestoes: SugestaoCadastro[],
  cacheAtual: Map<string, LinhaCacheAtual>,
  teto = TETO_CORRECOES_NOITE,
): { gravar: UpsertCadastro[]; pulados: PuladoNoturno[]; candidatos: number; excedeuTeto: boolean } {
  const gravar: UpsertCadastro[] = []
  const pulados: PuladoNoturno[] = []
  const protegida = (endereco: string) => {
    const fonte = cacheAtual.get(endereco)?.fonte
    return fonte != null && FONTES_PROTEGIDAS.has(fonte)
  }
  for (const s of sugestoes) {
    // Chave sem o sufixo de CEP (regressao 01/10); fonte protegida tanto na
    // chave quanto na linha antiga gravada com CEP bloqueia.
    if (protegida(chaveCacheEndereco(s.endereco)) || protegida(s.endereco)) { pulados.push({ endereco: s.endereco, motivo: 'fonte_protegida' }); continue }
    if (!coordenadaValidaRj(s.latNova, s.lngNova)) { pulados.push({ endereco: s.endereco, motivo: 'fora_do_rj' }); continue }
    gravar.push(montarUpsertCadastro(s))
  }
  const candidatos = gravar.length
  if (candidatos > teto) return { gravar: [], pulados, candidatos, excedeuTeto: true }
  return { gravar, pulados, candidatos, excedeuTeto: false }
}

// Cliente minimo (Supabase service client ou mock de teste).
type Resp<T> = PromiseLike<{ data?: T | null; error: { message: string } | null }>
export type ClienteCache = {
  from(tabela: string): {
    select(colunas: string): { in(coluna: string, valores: string[]): Resp<LinhaCacheAtual[]> }
    upsert(linha: UpsertCadastro, opcoes: { onConflict: string }): Resp<unknown>
  }
}

type OpcoesAplicar = { dirSaida: string; teto?: number; log?: (m: string) => void }

export async function aplicarCadastroNoturno(
  svc: ClienteCache,
  sugestoes: SugestaoCadastro[],
  opcoes: OpcoesAplicar,
): Promise<{ gravados: string[]; pulados: PuladoNoturno[]; excedeuTeto: boolean; caminhoBackup: string | null }> {
  const log = opcoes.log ?? ((m: string) => console.log(`[correcao-geocode-noturna] ${m}`))
  const enderecos = enderecosParaLerCache([...new Set(sugestoes.map(s => s.endereco))])
  const cacheAtual = new Map<string, LinhaCacheAtual>()
  for (let i = 0; i < enderecos.length; i += 20) {
    const { data, error } = await svc.from(TABELA_CACHE).select('endereco,lat,lng,confiavel,fonte,motivo').in('endereco', enderecos.slice(i, i + 20))
    if (error) throw new Error(`leitura do cache falhou: ${error.message}`)
    for (const r of data ?? []) cacheAtual.set(r.endereco, r)
  }

  const { gravar, pulados, candidatos, excedeuTeto } = montarLoteNoturno(sugestoes, cacheAtual, opcoes.teto)
  for (const p of pulados) log(`pulado (${p.motivo}): ${p.endereco}`)
  if (excedeuTeto) {
    log(`aplicar: ${candidatos} correcoes cadastro_unitrac > teto ${opcoes.teto ?? TETO_CORRECOES_NOITE} -- excedeu o teto — revisão manual (nada gravado)`)
    return { gravados: [], pulados, excedeuTeto: true, caminhoBackup: null }
  }
  if (gravar.length === 0) {
    log('aplicar: nenhuma correcao cadastro_unitrac a gravar')
    return { gravados: [], pulados, excedeuTeto: false, caminhoBackup: null }
  }

  // Backup ANTES de gravar: estado atual de cada linha que sera' sobrescrita
  // (endereco ausente do cache sai com campos vazios = "nao existia").
  mkdirSync(opcoes.dirSaida, { recursive: true })
  const caminhoBackup = path.join(opcoes.dirSaida, ARQUIVO_BACKUP)
  const backup = gravar.map(g => cacheAtual.get(g.endereco) ?? { endereco: g.endereco, lat: null, lng: null, confiavel: null, fonte: null, motivo: null })
  // Append: uma 2a execucao no mesmo dia (cron 03h50 e 04h50) nao pode apagar os
  // valores anteriores guardados pela 1a. Cabecalho so' quando o arquivo e' novo.
  const csv = csvBackupCache(backup)
  if (existsSync(caminhoBackup)) appendFileSync(caminhoBackup, csv.split('\n').slice(1).join('\n'))
  else writeFileSync(caminhoBackup, csv)
  log(`backup: ${backup.length} linhas em ${caminhoBackup}`)

  const gravados: string[] = []
  for (const g of gravar) {
    const { error } = await svc.from(TABELA_CACHE).upsert(g, { onConflict: 'endereco' })
    if (error) {
      log(`FALHA no upsert de ${g.endereco}: ${error.message}`)
      log(`gravados antes da falha (${gravados.length}): ${gravados.join(' | ')}`)
      throw new Error(`upsert falhou em ${g.endereco} (${gravados.length}/${gravar.length} gravados antes): ${error.message}`)
    }
    gravados.push(g.endereco)
  }
  log(`aplicar: gravados ${gravados.length}/${gravar.length} (fonte cadastro_unitrac): ${gravados.join(' | ')}`)
  return { gravados, pulados, excedeuTeto: false, caminhoBackup }
}

/** Sem GEOCODE_NOTURNO_APLICAR=1: nao toca no banco (so' relatorio). */
export async function aplicarSeHabilitado(
  env: Record<string, string | undefined>,
  svc: ClienteCache,
  sugestoes: SugestaoCadastro[],
  opcoes: OpcoesAplicar,
) {
  if (!aplicarHabilitado(env)) {
    ;(opcoes.log ?? console.log)(`[correcao-geocode-noturna] GEOCODE_NOTURNO_APLICAR!=1: so' relatorio (${sugestoes.length} sugestoes cadastro_unitrac no CSV, nada gravado)`)
    return null
  }
  return aplicarCadastroNoturno(svc, sugestoes, opcoes)
}

async function main() {
  const argData = process.argv[2]
  if (argData && !/^\d{4}-\d{2}-\d{2}$/.test(argData)) {
    console.error('Uso: correcao-geocode-noturna.ts [AAAA-MM-DD]')
    process.exit(1)
    return
  }
  const data = argData ?? diaAnterior(hojeBR())

  const svc = createServiceClient()
  const { data: rows, error } = await svc
    .from('kpi_romaneio_geracoes')
    .select('id, gerado_em, romaneio_storage_path')
    .eq('cliente', CLIENTE)
    .eq('data_referencia', data)
  if (error) throw new Error(`falha ao buscar geracoes: ${error.message}`)

  const geracao = escolherGeracao(rows ?? [])
  if (!geracao) {
    console.log(`[correcao-geocode-noturna] sem geracao de ${CLIENTE} com romaneio guardado pra ${data} -- nada a fazer`)
    return
  }

  const { data: download, error: erroDownload } = await svc.storage.from(BUCKET).download(geracao.romaneio_storage_path as string)
  if (erroDownload || !download) {
    throw new Error(`falha ao baixar romaneio do Storage (${geracao.romaneio_storage_path}): ${erroDownload?.message ?? 'sem dados'}`)
  }
  const romaneioBuf = Buffer.from(await download.arrayBuffer())

  const dirSaida = path.join(process.cwd(), 'relatorios-geocode', data)
  const resultado = await rodarCorrecao(romaneioBuf, data, { aplicar: false, dirSaida })

  console.log(`[correcao-geocode-noturna] data=${data} geracao=${geracao.id} sugestoes=${resultado.sugestoes} rejeicoes=${JSON.stringify(resultado.rejeicoes)}`)
  console.log(`[correcao-geocode-noturna] arquivos: ${resultado.arquivos.join(', ')}`)

  await aplicarSeHabilitado(process.env, svc as unknown as ClienteCache, resultado.cadastro, { dirSaida })
}

if (process.env.VITEST !== 'true') main().catch(e => { console.error(e); process.exit(1) })
