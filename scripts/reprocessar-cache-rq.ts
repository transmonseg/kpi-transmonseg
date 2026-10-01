// Reprocessa as entradas ANTIGAS da Rio Quality no kpi_romaneio_geocode_cache
// (relatorio ~/ClaudeGerado/kpi-regen-0922/rq-mesmo-lugar-e-sem-rastreador.md,
// A2.2): gravadas antes de 12/09 (antes das colunas fonte/confiavel/motivo e
// da guarda territorial), `fonte IS NULL` e `confiavel` true por DEFAULT da
// coluna -- nunca validadas e mesmo assim sustentando "NAO FOI AO CLIENTE"
// (rua homonima em outro bairro: Estrada do Monteiro/Campo Grande caiu na
// zona norte, a 9,4 km). ~219 enderecos no dia 30/09.
//
// Enderecos da RQ = formato bruto de montarEnderecoBrutoCompleto ("RUA, -
// BAIRRO, CIDADE - UF", rua SEM numero). Opcional: --planilha <xlsx> restringe
// aos enderecos de um arquivo do dia (formatos com cidade).
//
// Uso:
//   npx tsx --env-file=.env.production scripts/reprocessar-cache-rq.ts [--planilha <xlsx>]            (so' propoe: CSV)
//   npx tsx --env-file=.env.production scripts/reprocessar-cache-rq.ts [--planilha <xlsx>] --aplicar   (grava, com backup antes)
//
// Sem --aplicar: re-geocodifica cada endereco com a cascata ATUAL + guarda
// territorial (validarTerritorio), SEM ler/gravar cache, e escreve
// reprocessar-cache-rq-propostas.csv. Com --aplicar: backup CSV das linhas
// atuais e grava so' as propostas atualizar/confirmar -- nunca sobrescreve
// fonte manual/verificacao_manual nem linha que ganhou fonte desde a
// listagem; endereco que a cascata nao resolve fica como esta'.
import { readFileSync, writeFileSync } from 'fs'
import { haversine } from '../src/lib/utils/geo'
import type { ResultadoGeocode } from '../src/lib/kpi-romaneio/geocode'

export const CORTE_CACHE_ANTIGO = '2026-09-12T00:00:00-03:00'
/** Nova coordenada a ate' isto da antiga = mesma (so' confirma a fonte). */
export const TOLERANCIA_MESMA_COORD_M = 50
const FONTES_MANUAIS = new Set(['manual', 'verificacao_manual'])

export type LinhaCacheRq = { endereco: string; lat: number | null; lng: number | null; confiavel: boolean | null; fonte: string | null; motivo: string | null; criado_em?: string | null }

export type Proposta = {
  endereco: string
  latAntiga: number | null
  lngAntiga: number | null
  latNova: number | null
  lngNova: number | null
  distanciaM: number | null
  fonteNova: string | null
  confiavelNova: boolean | null
  motivoNova: string | null
  acao: 'atualizar' | 'confirmar' | 'sem_resultado'
}

export function ehEnderecoRq(endereco: string): boolean {
  return /^[^,]+, - .+, .+ - [A-Z]{2}$/.test(endereco.trim())
}

export function proporCorrecoes(candidatos: LinhaCacheRq[], resultados: ResultadoGeocode[]): Proposta[] {
  return candidatos.map((c, i) => {
    const r = resultados[i] ?? null
    if (!r) {
      return { endereco: c.endereco, latAntiga: c.lat, lngAntiga: c.lng, latNova: null, lngNova: null, distanciaM: null, fonteNova: null, confiavelNova: null, motivoNova: null, acao: 'sem_resultado' }
    }
    const dist = c.lat != null && c.lng != null ? Math.round(haversine(c.lat, c.lng, r.lat, r.lng)) : null
    const mesma = dist != null && dist <= TOLERANCIA_MESMA_COORD_M && r.confiavel
    return {
      endereco: c.endereco, latAntiga: c.lat, lngAntiga: c.lng, latNova: r.lat, lngNova: r.lng, distanciaM: dist,
      fonteNova: r.fonte ?? null, confiavelNova: r.confiavel, motivoNova: r.motivo ?? null,
      acao: mesma ? 'confirmar' : 'atualizar',
    }
  })
}

export type Gravacao = { endereco: string; lat: number; lng: number; fonte: string; confiavel: boolean; motivo: string | null }

export function montarGravacoes(propostas: Proposta[], atual: Map<string, LinhaCacheRq>): { gravar: Gravacao[]; pulados: { endereco: string; motivo: 'fonte_manual' | 'ja_tem_fonte' | 'sem_resultado' | 'ausente' }[] } {
  const gravar: Gravacao[] = []
  const pulados: { endereco: string; motivo: 'fonte_manual' | 'ja_tem_fonte' | 'sem_resultado' | 'ausente' }[] = []
  for (const p of propostas) {
    if (p.acao === 'sem_resultado' || p.latNova == null || p.lngNova == null) { pulados.push({ endereco: p.endereco, motivo: 'sem_resultado' }); continue }
    const a = atual.get(p.endereco)
    if (!a) { pulados.push({ endereco: p.endereco, motivo: 'ausente' }); continue }
    if (a.fonte && FONTES_MANUAIS.has(a.fonte)) { pulados.push({ endereco: p.endereco, motivo: 'fonte_manual' }); continue }
    if (a.fonte) { pulados.push({ endereco: p.endereco, motivo: 'ja_tem_fonte' }); continue }
    gravar.push({ endereco: p.endereco, lat: p.latNova, lng: p.lngNova, fonte: p.fonteNova ?? 'reprocessado', confiavel: p.confiavelNova ?? true, motivo: p.motivoNova })
  }
  return { gravar, pulados }
}

const limpa = (v: unknown) => (v == null ? '' : String(v).replace(/[;\n\r]/g, ','))

export function csvPropostas(propostas: Proposta[]): string {
  const cab = 'endereco;lat_antiga;lng_antiga;lat_nova;lng_nova;distancia_m;fonte_nova;confiavel_nova;motivo_nova;acao'
  return [cab, ...propostas.map(p => [p.endereco, p.latAntiga, p.lngAntiga, p.latNova, p.lngNova, p.distanciaM, p.fonteNova, p.confiavelNova, p.motivoNova, p.acao].map(limpa).join(';'))].join('\n') + '\n'
}

function csvBackup(linhas: LinhaCacheRq[]): string {
  return ['endereco;lat;lng;confiavel;fonte;motivo;criado_em', ...linhas.map(l => [l.endereco, l.lat, l.lng, l.confiavel, l.fonte, l.motivo, l.criado_em].map(limpa).join(';'))].join('\n') + '\n'
}

export type DepsReprocessar = {
  /** Linhas do cache com fonte IS NULL e criado_em < CORTE_CACHE_ANTIGO. */
  listarCandidatos: () => Promise<LinhaCacheRq[]>
  /** Cascata atual + guarda territorial, sem cache. */
  geocodificar: (enderecos: string[]) => Promise<ResultadoGeocode[]>
  lerAtual: (enderecos: string[]) => Promise<Map<string, LinhaCacheRq>>
  gravar: (linhas: Gravacao[]) => Promise<number>
  escrever: (caminho: string, conteudo: string) => void
}

export async function rodar(
  opcoes: { aplicar: boolean; dirSaida: string; enderecosPlanilha?: Set<string> },
  deps: DepsReprocessar,
): Promise<{ candidatos: number; propostasAtualizar: number; propostasConfirmar: number; semResultado: number; gravados: number }> {
  const candidatos = (await deps.listarCandidatos())
    .filter(l => ehEnderecoRq(l.endereco))
    .filter(l => !opcoes.enderecosPlanilha || opcoes.enderecosPlanilha.has(l.endereco))
  console.log(`${candidatos.length} endereco(s) da RQ no cache sem fonte, anteriores a 12/09`)
  const resultados = await deps.geocodificar(candidatos.map(c => c.endereco))
  const propostas = proporCorrecoes(candidatos, resultados)
  const conta = (a: Proposta['acao']) => propostas.filter(p => p.acao === a).length
  const caminhoPropostas = `${opcoes.dirSaida}/reprocessar-cache-rq-propostas.csv`
  deps.escrever(caminhoPropostas, csvPropostas(propostas))
  console.log(`propostas: atualizar=${conta('atualizar')} confirmar=${conta('confirmar')} sem_resultado=${conta('sem_resultado')} -> ${caminhoPropostas}`)
  const resumo = { candidatos: candidatos.length, propostasAtualizar: conta('atualizar'), propostasConfirmar: conta('confirmar'), semResultado: conta('sem_resultado'), gravados: 0 }
  if (!opcoes.aplicar) {
    console.log('(sem --aplicar: nada gravado)')
    return resumo
  }
  const atual = await deps.lerAtual(propostas.map(p => p.endereco))
  const { gravar, pulados } = montarGravacoes(propostas, atual)
  for (const p of pulados) console.log(`  pulado (${p.motivo}): ${p.endereco}`)
  // Backup ANTES de gravar: estado atual das linhas que serao sobrescritas.
  const caminhoBackup = `${opcoes.dirSaida}/reprocessar-cache-rq-backup.csv`
  deps.escrever(caminhoBackup, csvBackup(gravar.map(g => atual.get(g.endereco)!)))
  console.log(`backup: ${gravar.length} linha(s) em ${caminhoBackup}`)
  const gravados = await deps.gravar(gravar)
  console.log(`gravados ${gravados}/${gravar.length}`)
  if (gravados < gravar.length) throw new Error(`gravados apenas ${gravados}/${gravar.length}`)
  return { ...resumo, gravados }
}

async function depsReais(): Promise<DepsReprocessar> {
  const { createServiceClient } = await import('../src/lib/supabase/service')
  const { geocodificarSemCache } = await import('../src/lib/kpi-romaneio/geocode')
  const svc = createServiceClient()
  const COLS = 'endereco,lat,lng,confiavel,fonte,motivo,criado_em'
  return {
    async listarCandidatos() {
      const out: LinhaCacheRq[] = []
      for (let de = 0; ; de += 1000) {
        const { data, error } = await svc.from('kpi_romaneio_geocode_cache').select(COLS)
          .is('fonte', null).lt('criado_em', CORTE_CACHE_ANTIGO).like('endereco', '%, - %')
          .order('endereco').range(de, de + 999)
        if (error) throw new Error(`leitura do cache falhou: ${error.message}`)
        out.push(...((data ?? []) as LinhaCacheRq[]))
        if ((data ?? []).length < 1000) break
      }
      return out
    },
    geocodificar: enderecos => geocodificarSemCache(enderecos, { validarTerritorio: true }),
    async lerAtual(enderecos) {
      const mapa = new Map<string, LinhaCacheRq>()
      for (let i = 0; i < enderecos.length; i += 20) {
        const { data, error } = await svc.from('kpi_romaneio_geocode_cache').select(COLS).in('endereco', enderecos.slice(i, i + 20))
        if (error) throw new Error(`leitura do cache falhou: ${error.message}`)
        for (const r of (data ?? []) as LinhaCacheRq[]) mapa.set(r.endereco, r)
      }
      return mapa
    },
    async gravar(linhas) {
      let ok = 0
      for (const g of linhas) {
        const { error } = await svc.from('kpi_romaneio_geocode_cache').upsert(g, { onConflict: 'endereco' })
        if (error) console.error(`falha ${g.endereco}: ${error.message}`); else ok++
      }
      return ok
    },
    escrever: (caminho, conteudo) => writeFileSync(caminho, conteudo),
  }
}

async function enderecosDaPlanilha(caminho: string): Promise<Set<string>> {
  const { parseEntregasCompletas, montarEnderecoBrutoCompleto } = await import('../src/lib/kpi-rioquality/parse-planilhas')
  const entregas = parseEntregasCompletas(readFileSync(caminho))
  if (entregas.length === 0) throw new Error(`nenhuma linha reconhecida em ${caminho} (precisa ser o arquivo unico da RQ, com cidade)`)
  return new Set(entregas.map(e => montarEnderecoBrutoCompleto(e.rua, e.bairro, e.cidade, e.uf)))
}

async function main() {
  const args = process.argv.slice(2)
  const aplicar = args.includes('--aplicar')
  const iPlanilha = args.indexOf('--planilha')
  const enderecosPlanilha = iPlanilha >= 0 && args[iPlanilha + 1] ? await enderecosDaPlanilha(args[iPlanilha + 1]) : undefined
  await rodar({ aplicar, dirSaida: process.cwd(), enderecosPlanilha }, await depsReais())
}

const ehEntrypoint = (process.argv[1] ?? '').endsWith('reprocessar-cache-rq.ts')
if (process.env.VITEST !== 'true' && ehEntrypoint) main().catch(e => { console.error(e); process.exit(1) })
