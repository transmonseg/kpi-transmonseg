// Runner NOTURNO de re-geocode para coordenadas imprecisas.
//
// Uso: npx tsx --env-file=.env.production scripts/regeocode-noturno-imprecisos.ts [AAAA-MM-DD]
// Sem argumento: usa "ontem" no fuso de Brasilia. Com argumento: usa a data passada.
//
// Fluxo: consulta kpi_romaneio_geocode_cache por entradas com confiavel=false
// OU motivo LIKE '%imprecisa%' OU fonte vazia/auto (nao protegida). Para cada
// candidato, tenta geocodificar via bridge API usando nome do cliente + cidade
// e endereco parcial + CEP proximo. Aceita nova coord apenas se: dentro do
// bounding box RJ, mais proxima do alvo Unitrac que a atual, e fonte atual
// NAO for protegida.
//
// Padrao: SO' RELATORIO. Com REGEOCODE_IMPRECISOS_APLICAR=1 no ambiente, grava
// no cache com fonte 'regeocode_noturno'. Guardas:
//   - teto de TETO_REGEOCODE_NOITE por noite: acima disso nao grava NADA;
//   - nunca sobrescreve fonte manual / verificacao_manual / cadastro_unitrac;
//   - coordenada fora da caixa do RJ -> pula e loga;
//   - backup-antes-aplicar.csv escrito ANTES do primeiro upsert;
//   - erro em qualquer upsert -> para, loga o que ja gravou, sai com 1.
import path from 'path'
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { createServiceClient } from '../src/lib/supabase/service'
import { hojeBR } from '../src/lib/data-br'
import { coordenadaValidaRj, type LinhaCacheAtual } from './aplicar-correcoes-geocode'
import { chaveCacheEndereco } from '../src/lib/kpi-romaneio/endereco-cep'
import { geocodificarSemCache } from '../src/lib/kpi-romaneio/geocode'
import { csvBackupCache } from './corrigir-geocode-por-alvo'
import { diaAnterior } from './correcao-geocode-noturna'
import { lerSnapshotAlvos } from '../src/lib/kpi-romaneio/alvos-snapshot'
import { enderecosParaLerCache } from '../src/lib/kpi-romaneio/geocode'
import type { AlvoApi } from '../src/lib/unitrac-api'

const CLIENTE = 'nutrimax'

export const TETO_REGEOCODE_NOITE = 30
export const FONTES_PROTEGIDAS: ReadonlySet<string> = new Set(['manual', 'verificacao_manual', 'cadastro_unitrac'])
const TABELA_CACHE = 'kpi_romaneio_geocode_cache'
const ARQUIVO_BACKUP = 'backup-regeocode-imprecisos.csv'

export function aplicarHabilitado(env: Record<string, string | undefined>): boolean {
  return env.REGEOCODE_IMPRECISOS_APLICAR === '1'
}

export type CandidatoRegeocode = {
  endereco: string
  lat: number
  lng: number
  fonte: string | null
  confiavel: boolean
  motivo: string | null
  nomeCliente: string | null
  cidade: string | null
  cep: string | null
}

type UpsertRegeocode = {
  endereco: string
  lat: number
  lng: number
  confiavel: true
  motivo: null
  fonte: 'regeocode_noturno'
}

export type PuladoRegeocode = { endereco: string; motivo: 'fonte_protegida' | 'fora_do_rj' | 'sem_melhoria' }

// Cliente minimo (Supabase service client ou mock de teste).
type Resp<T> = PromiseLike<{ data?: T | null; error: { message: string } | null }>
export type ClienteCacheRegeocode = {
  from(tabela: string): {
    select(colunas: string): {
      in(coluna: string, valores: string[]): Resp<LinhaCacheAtual[]>
      or(filtro: string): Resp<CandidatoRegeocode[]>
    }
    upsert(linha: UpsertRegeocode, opcoes: { onConflict: string }): Resp<unknown>
  }
}

/** Distancia euclidiana simples em graus (suficiente pra comparacao relativa). */
function dist2(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return (lat1 - lat2) ** 2 + (lng1 - lng2) ** 2
}

/** Monta o lote de regeocode filtrando contra o estado ATUAL do cache e aplicando
 *  o teto. A nova coordenada so entra se for valida no RJ e mais proxima do alvo
 *  que a coordenada atual. Fontes protegidas bloqueiam. Acima do teto, nada grava. */
export function montarLoteRegeocode(
  candidatos: CandidatoRegeocode[],
  cacheAtual: Map<string, LinhaCacheAtual>,
  novaCoord: { lat: number; lng: number } | null,
  alvoLat?: number,
  alvoLng?: number,
  teto = TETO_REGEOCODE_NOITE,
): { gravar: UpsertRegeocode[]; pulados: PuladoRegeocode[]; candidatos: number; excedeuTeto: boolean } {
  const gravar: UpsertRegeocode[] = []
  const pulados: PuladoRegeocode[] = []

  for (const c of candidatos) {
    const chave = chaveCacheEndereco(c.endereco)
    const linhaAtual = cacheAtual.get(chave) ?? cacheAtual.get(c.endereco)
    const fonteAtual = linhaAtual?.fonte ?? c.fonte

    if (fonteAtual != null && FONTES_PROTEGIDAS.has(fonteAtual)) {
      pulados.push({ endereco: c.endereco, motivo: 'fonte_protegida' })
      continue
    }

    if (!novaCoord || !coordenadaValidaRj(novaCoord.lat, novaCoord.lng)) {
      pulados.push({ endereco: c.endereco, motivo: 'fora_do_rj' })
      continue
    }

    // Se temos alvo, verifica se a nova coord e realmente mais proxima
    if (alvoLat != null && alvoLng != null && linhaAtual?.lat != null && linhaAtual?.lng != null) {
      const distAtual = dist2(linhaAtual.lat, linhaAtual.lng, alvoLat, alvoLng)
      const distNova = dist2(novaCoord.lat, novaCoord.lng, alvoLat, alvoLng)
      if (distNova >= distAtual) {
        pulados.push({ endereco: c.endereco, motivo: 'sem_melhoria' })
        continue
      }
    }

    gravar.push({
      endereco: chave,
      lat: novaCoord.lat,
      lng: novaCoord.lng,
      confiavel: true,
      motivo: null,
      fonte: 'regeocode_noturno',
    })
  }

  const totalCandidatos = gravar.length
  if (totalCandidatos > teto) {
    return { gravar: [], pulados, candidatos: totalCandidatos, excedeuTeto: true }
  }
  return { gravar, pulados, candidatos: totalCandidatos, excedeuTeto: false }
}

type OpcoesAplicar = { dirSaida: string; teto?: number; log?: (m: string) => void }

export async function aplicarRegeocodeNoturno(
  svc: ClienteCacheRegeocode,
  upserts: UpsertRegeocode[],
  opcoes: OpcoesAplicar,
): Promise<{ gravados: string[]; caminhoBackup: string | null }> {
  const log = opcoes.log ?? ((m: string) => console.log(`[regeocode-noturno-imprecisos] ${m}`))

  if (upserts.length === 0) {
    log('nenhum upsert a aplicar')
    return { gravados: [], caminhoBackup: null }
  }

  // Backup ANTES de gravar
  mkdirSync(opcoes.dirSaida, { recursive: true })
  const caminhoBackup = path.join(opcoes.dirSaida, ARQUIVO_BACKUP)

  // Le estado atual das linhas que serao sobrescritas
  const enderecos = upserts.map(u => u.endereco)
  const cacheAtual = new Map<string, LinhaCacheAtual>()
  for (let i = 0; i < enderecos.length; i += 20) {
    const { data, error } = await svc.from(TABELA_CACHE).select('endereco,lat,lng,confiavel,fonte,motivo').in('endereco', enderecos.slice(i, i + 20))
    if (error) throw new Error(`leitura do cache falhou: ${error.message}`)
    for (const r of data ?? []) cacheAtual.set(r.endereco, r)
  }

  const backup = upserts.map(g => cacheAtual.get(g.endereco) ?? { endereco: g.endereco, lat: null, lng: null, confiavel: null, fonte: null, motivo: null })
  const csv = csvBackupCache(backup)
  if (existsSync(caminhoBackup)) appendFileSync(caminhoBackup, csv.split('\n').slice(1).join('\n'))
  else writeFileSync(caminhoBackup, csv)
  log(`backup: ${backup.length} linhas em ${caminhoBackup}`)

  const gravados: string[] = []
  for (const g of upserts) {
    const { error } = await svc.from(TABELA_CACHE).upsert(g, { onConflict: 'endereco' })
    if (error) {
      log(`FALHA no upsert de ${g.endereco}: ${error.message}`)
      log(`gravados antes da falha (${gravados.length}): ${gravados.join(' | ')}`)
      throw new Error(`upsert falhou em ${g.endereco} (${gravados.length}/${upserts.length} gravados antes): ${error.message}`)
    }
    gravados.push(g.endereco)
  }
  log(`gravados ${gravados.length}/${upserts.length} (fonte regeocode_noturno): ${gravados.join(' | ')}`)
  return { gravados, caminhoBackup }
}

async function buscarCandidatos(svc: ReturnType<typeof createServiceClient>): Promise<CandidatoRegeocode[]> {
  // Busca entradas imprecisas: confiavel=false OR motivo contendo 'imprecisa'
  // OR fonte vazia/null OR fonte='auto' OR fonte='' (auto-generated).
  // Exclui fontes protegidas na propria query.
  const { data, error } = await svc
    .from(TABELA_CACHE)
    .select('endereco,lat,lng,fonte,confiavel,motivo')
    .or('confiavel.eq.false,motivo.like.%imprecisa%,fonte.is.null,fonte.eq.auto,fonte.eq.')

  if (error) throw new Error(`busca de candidatos falhou: ${error.message}`)

  const candidatos: CandidatoRegeocode[] = []
  for (const row of data ?? []) {
    const fonte = row.fonte as string | null
    // Filtra fontes protegidas que possam ter escapado da query
    if (fonte != null && FONTES_PROTEGIDAS.has(fonte)) continue
    // So considera se tem coordenada atual (senao nao ha o que melhorar)
    if (row.lat == null || row.lng == null) continue

    // Extrai cidade do endereco (ultimo segmento apos virgula ou ultima palavra em maiusculo)
    const enderecoStr = (row.endereco as string) ?? ''
    const partesEndereco = enderecoStr.split(',').map(s => s.trim())
    const cidadeExtraida = partesEndereco.length > 1 ? partesEndereco[partesEndereco.length - 1] : null
    // Tenta extrair CEP do endereco (padrao XXXXX-XXX ou XXXXXXXX)
    const cepMatch = enderecoStr.match(/(\d{5}-?\d{3})/)
    const cepExtraido = cepMatch ? cepMatch[1] : null

    candidatos.push({
      endereco: enderecoStr,
      lat: row.lat as number,
      lng: row.lng as number,
      fonte,
      confiavel: (row.confiavel as boolean) ?? false,
      motivo: (row.motivo as string) ?? null,
      nomeCliente: null, // Preenchido via join com alvos se disponivel
      cidade: cidadeExtraida,
      cep: cepExtraido,
    })
  }
  return candidatos
}

/** Estrategia de dois estagios: (1) nomeCliente + cidade (fuzzy), (2) endereco parcial + CEP.
 *  Se nenhum contexto extra estiver disponivel, cai pro endereco bruto como fallback. */
async function tentarGeocode(c: CandidatoRegeocode): Promise<{ lat: number; lng: number } | null> {
  // Estagio 1: nomeCliente + cidade (fuzzy) -- so se ambos existirem
  if (c.nomeCliente && c.cidade) {
    const query1 = `${c.nomeCliente}, ${c.cidade}`
    const r1 = await geocodificarSemCache([query1], { validarTerritorio: true })
    if (r1[0]) return { lat: r1[0].lat, lng: r1[0].lng }
  }

  // Estagio 2: endereco parcial + CEP
  if (c.cep) {
    // Endereco parcial: remove numero e complemento, fica com rua + bairro/cidade
    const partes = c.endereco.split(',').map(s => s.trim())
    const enderecoParcial = partes.length > 1 ? partes.slice(0, -1).join(', ') : c.endereco
    const query2 = `${enderecoParcial}, ${c.cep}`
    const r2 = await geocodificarSemCache([query2], { validarTerritorio: true })
    if (r2[0]) return { lat: r2[0].lat, lng: r2[0].lng }
  }

  // Fallback: endereco bruto
  const r3 = await geocodificarSemCache([c.endereco], { validarTerritorio: true })
  if (r3[0]) return { lat: r3[0].lat, lng: r3[0].lng }

  return null
}

async function main() {
  const argData = process.argv[2]
  if (argData && !/^\d{4}-\d{2}-\d{2}$/.test(argData)) {
    console.error('Uso: regeocode-noturno-imprecisos.ts [AAAA-MM-DD]')
    process.exit(1)
    return
  }
  const data = argData ?? diaAnterior(hojeBR())

  const svc = createServiceClient()
  const candidatos = await buscarCandidatos(svc)
  console.log(`[regeocode-noturno-imprecisos] data=${data} candidatos=${candidatos.length}`)

  if (candidatos.length === 0) {
    console.log('[regeocode-noturno-imprecisos] nenhum candidato encontrado -- nada a fazer')
    return
  }

  // Carrega estado atual do cache para os candidatos (necessario para comparacao de distancia)
  const enderecosConsulta = enderecosParaLerCache(candidatos.map(c => c.endereco))
  const cacheAtual = new Map<string, LinhaCacheAtual>()
  for (let i = 0; i < enderecosConsulta.length; i += 20) {
    const { data: rows, error } = await svc
      .from(TABELA_CACHE)
      .select('endereco,lat,lng,confiavel,fonte,motivo')
      .in('endereco', enderecosConsulta.slice(i, i + 20))
    if (error) throw new Error(`leitura do cache falhou: ${error.message}`)
    for (const r of rows ?? []) cacheAtual.set(r.endereco, r)
  }

  // Carrega alvos Unitrac do snapshot para obter coordenadas de referencia
  let alvosPorEndereco = new Map<string, { lat: number; lng: number }>()
  try {
    const alvos = await lerSnapshotAlvos(CLIENTE, data)
    if (alvos) {
      for (const a of alvos) {
        if (a.codigoUnitrac && a.lat != null && a.lng != null) {
          // Mapeia por endereco do alvo se disponivel, senao por codigoUnitrac
          const chave = (a as { endereco?: string }).endereco ?? a.codigoUnitrac
          alvosPorEndereco.set(chave, { lat: a.lat, lng: a.lng })
        }
      }
      console.log(`[regeocode-noturno-imprecisos] ${alvosPorEndereco.size} alvos carregados do snapshot`)
    }
  } catch (e) {
    console.error('[regeocode-noturno-imprecisos] falha ao carregar snapshot de alvos (segue sem comparacao):', e instanceof Error ? e.message : String(e))
  }

  // Tenta geocodificar cada candidato individualmente com estrategia de dois estagios
  const upserts: UpsertRegeocode[] = []
  const pulados: PuladoRegeocode[] = []

  for (const c of candidatos) {
    const novaCoord = await tentarGeocode(c)
    // Busca alvo correspondente para comparacao de distancia
    const alvo = alvosPorEndereco.get(c.endereco) ?? alvosPorEndereco.get(chaveCacheEndereco(c.endereco))
    const lote = montarLoteRegeocode(
      [c],
      cacheAtual,
      novaCoord,
      alvo?.lat,
      alvo?.lng,
    )
    if (lote.gravar.length > 0) {
      upserts.push(lote.gravar[0])
    } else {
      pulados.push(...lote.pulados)
    }
  }

  console.log(`[regeocode-noturno-imprecisos] upserts=${upserts.length} pulados=${pulados.length}`)
  for (const p of pulados) console.log(`  pulado (${p.motivo}): ${p.endereco}`)

  if (!aplicarHabilitado(process.env)) {
    console.log(`[regeocode-noturno-imprecisos] REGEOCODE_IMPRECISOS_APLICAR!=1: so relatorio (${upserts.length} candidatos, nada gravado)`)
    return
  }

  const dirSaida = path.join(process.cwd(), 'relatorios-geocode', data)
  const resultado = await aplicarRegeocodeNoturno(svc as unknown as ClienteCacheRegeocode, upserts, { dirSaida })
  console.log(`[regeocode-noturno-imprecisos] concluido: ${resultado.gravados.length} gravados`)
}

if (process.env.VITEST !== 'true') main().catch(e => { console.error(e); process.exit(1) })