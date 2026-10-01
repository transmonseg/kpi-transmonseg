// Descobre o CV (codigo do veiculo na Unitrac) das placas de uma planilha da
// Rio Quality que NAO estao em kpi_rioquality_frota -- relatorio
// ~/ClaudeGerado/kpi-regen-0922/rq-mesmo-lugar-e-sem-rastreador.md, PARTE B
// (LTU7C95 = CV 19364, SSW7J12 = CV 22272 sairam "SEM RASTREADOR" so' por
// estarem fora da frota).
//
// Metodo (o mesmo da varredura do relatorio): POST /mapa_servicos/posicoes/
// N/N com lista de CVs devolve placa + empresa (emprecodigo) + datagps de
// QUALQUER CV (a /S/N omite veiculos). Varre CVs 1..26000 em lotes de 500
// (52 chamadas), monta placa -> CV e casa por placa normalizada:
//   - exata, empresa da RQ (598 propria; 1169 Carioca Carga; 1194; 1197 FG2) -> ok
//   - exata de outra empresa, mas parada a <= 200 m da base da RQ -> conferir
//   - so' trocando O/0 ou I/1, empresa da RQ -> conferir
//   - senao -> nao_encontrada (ex. KZA2F01: sem rastreador de verdade)
//
// Uso:
//   npx tsx --env-file=.env.production scripts/descobrir-cv-rq.ts <planilha.xlsx>            (so' propoe: CSV)
//   npx tsx --env-file=.env.production scripts/descobrir-cv-rq.ts <planilha.xlsx> --aplicar   (insere as "ok")
//
// --aplicar insere em kpi_rioquality_frota SO' as propostas "ok" (as
// "conferir" ficam pra pessoa decidir) e nunca mexe em placa ja' cadastrada.
import { readFileSync, writeFileSync } from 'fs'
import { haversine } from '../src/lib/utils/geo'
import { normPlaca } from '../src/lib/unitrac-api/frota'
import type { PosicaoPorCv } from '../src/lib/unitrac-api/posicoes'
import { BASE_COORD_RIOQUALITY } from '../src/lib/kpi-rioquality/constants'

export const EMPRESAS_RQ = new Set(['598', '1169', '1194', '1197'])
export const MAX_CV_PADRAO = 26_000
export const LOTE_VARREDURA = 500
export const RAIO_BASE_M = 200

export type PropostaCv = {
  placa: string
  cv: string | null
  placaUnitrac: string | null
  empresa: string | null
  datagps: string | null
  situacao: 'ok' | 'conferir' | 'nao_encontrada'
  motivo: string
}

const TROCAS: Record<string, string> = { O: '0', '0': 'O', I: '1', '1': 'I' }

/** Placas parecidas trocando O/0 e I/1 (todas as combinacoes), sem a propria. */
export function variantesPlaca(placa: string): string[] {
  let atuais = ['']
  for (const ch of placa) {
    const alt = TROCAS[ch]
    atuais = atuais.flatMap(a => (alt ? [a + ch, a + alt] : [a + ch]))
  }
  return atuais.filter(v => v !== placa)
}

function naBase(p: PosicaoPorCv): boolean {
  return p.lat != null && p.lng != null && haversine(p.lat, p.lng, BASE_COORD_RIOQUALITY.lat, BASE_COORD_RIOQUALITY.lng) <= RAIO_BASE_M
}

export function proporCvs(placasSemCv: string[], posicoes: Map<string, PosicaoPorCv>): PropostaCv[] {
  const porPlaca = new Map<string, PosicaoPorCv[]>()
  for (const p of posicoes.values()) {
    if (!p.placa) continue
    const arr = porPlaca.get(p.placa) ?? []
    arr.push(p)
    porPlaca.set(p.placa, arr)
  }
  const proposta = (placa: string, p: PosicaoPorCv, situacao: PropostaCv['situacao'], motivo: string): PropostaCv =>
    ({ placa, cv: p.cv, placaUnitrac: p.placa, empresa: p.empresa, datagps: p.datagps, situacao, motivo })
  return placasSemCv.map(placa => {
    const exatas = porPlaca.get(placa) ?? []
    const daRq = exatas.filter(p => EMPRESAS_RQ.has(p.empresa))
    if (daRq.length === 1) return proposta(placa, daRq[0], 'ok', `placa exata, empresa ${daRq[0].empresa}`)
    if (daRq.length > 1) return proposta(placa, daRq[0], 'conferir', `${daRq.length} CVs com a mesma placa (${daRq.map(p => p.cv).join(', ')})`)
    const outraNaBase = exatas.find(naBase)
    if (outraNaBase) return proposta(placa, outraNaBase, 'conferir', `placa exata de outra empresa (${outraNaBase.empresa}), parada na base da RQ`)
    for (const v of variantesPlaca(placa)) {
      const parecida = (porPlaca.get(v) ?? []).find(p => EMPRESAS_RQ.has(p.empresa))
      if (parecida) return proposta(placa, parecida, 'conferir', `placa parecida na Unitrac (${v}, troca O/0 I/1)`)
    }
    return { placa, cv: null, placaUnitrac: null, empresa: null, datagps: null, situacao: 'nao_encontrada' as const, motivo: exatas.length > 0 ? `so' em outra empresa (${exatas.map(p => p.empresa).join(', ')})` : 'nao existe na Unitrac' }
  })
}

/** Varre CVs 1..maxCv em lotes de LOTE_VARREDURA (1 retry por lote; falhou
 *  de novo = lanca -- varredura incompleta nao pode virar "nao encontrada"). */
export async function varrerCvs(buscar: (cvs: string[]) => Promise<Map<string, PosicaoPorCv>>, maxCv = MAX_CV_PADRAO): Promise<Map<string, PosicaoPorCv>> {
  const out = new Map<string, PosicaoPorCv>()
  for (let ini = 1; ini <= maxCv; ini += LOTE_VARREDURA) {
    const lote = Array.from({ length: Math.min(LOTE_VARREDURA, maxCv - ini + 1) }, (_, i) => String(ini + i))
    let r: Map<string, PosicaoPorCv>
    try {
      r = await buscar(lote)
    } catch {
      r = await buscar(lote)
    }
    for (const [cv, p] of r) out.set(cv, p)
  }
  return out
}

const limpa = (v: unknown) => (v == null ? '' : String(v).replace(/[;\n\r]/g, ','))
export function csvPropostasCv(propostas: PropostaCv[]): string {
  return ['placa;cv;placa_unitrac;empresa;datagps;situacao;motivo',
    ...propostas.map(p => [p.placa, p.cv, p.placaUnitrac, p.empresa, p.datagps, p.situacao, p.motivo].map(limpa).join(';'))].join('\n') + '\n'
}

export type DepsDescobrirCv = {
  lerFrota: () => Promise<Map<string, string>>
  buscarPosicoes: (cvs: string[]) => Promise<Map<string, PosicaoPorCv>>
  inserir: (linhas: { placa_norm: string; cv: string; nome: null }[]) => Promise<number>
  escrever: (caminho: string, conteudo: string) => void
}

export async function rodar(
  opcoes: { placas: Set<string>; aplicar: boolean; dirSaida: string; maxCv?: number },
  deps: DepsDescobrirCv,
): Promise<{ semCv: number; ok: number; conferir: number; naoEncontradas: number; inseridos: number }> {
  const frota = await deps.lerFrota()
  const semCv = [...opcoes.placas].map(normPlaca).filter(p => p && !frota.has(p)).sort()
  console.log(`${opcoes.placas.size} placa(s) na planilha, ${semCv.length} fora da frota: ${semCv.join(', ')}`)
  if (semCv.length === 0) return { semCv: 0, ok: 0, conferir: 0, naoEncontradas: 0, inseridos: 0 }
  const posicoes = await varrerCvs(deps.buscarPosicoes, opcoes.maxCv ?? MAX_CV_PADRAO)
  console.log(`varredura: ${posicoes.size} CV(s) responderam`)
  const propostas = proporCvs(semCv, posicoes)
  const caminho = `${opcoes.dirSaida}/descobrir-cv-rq-propostas.csv`
  deps.escrever(caminho, csvPropostasCv(propostas))
  for (const p of propostas) console.log(`  ${p.placa}: ${p.situacao}${p.cv ? ` CV ${p.cv}` : ''} -- ${p.motivo}`)
  const ok = propostas.filter(p => p.situacao === 'ok')
  const resumo = { semCv: semCv.length, ok: ok.length, conferir: propostas.filter(p => p.situacao === 'conferir').length, naoEncontradas: propostas.filter(p => p.situacao === 'nao_encontrada').length, inseridos: 0 }
  console.log(`propostas em ${caminho}`)
  if (!opcoes.aplicar || ok.length === 0) {
    if (!opcoes.aplicar) console.log('(sem --aplicar: nada inserido)')
    return resumo
  }
  const inseridos = await deps.inserir(ok.map(p => ({ placa_norm: p.placa, cv: p.cv!, nome: null })))
  console.log(`inseridos ${inseridos}/${ok.length} em kpi_rioquality_frota`)
  return { ...resumo, inseridos }
}

async function placasDaPlanilha(caminho: string): Promise<Set<string>> {
  const { parseEntregasCompletas, parseEntregas } = await import('../src/lib/kpi-rioquality/parse-planilhas')
  const buf = readFileSync(caminho)
  const completas = parseEntregasCompletas(buf)
  const placas = completas.length > 0 ? completas.map(e => e.placaNorm) : parseEntregas(buf).map(e => e.placaNorm)
  return new Set(placas.filter(Boolean))
}

async function depsReais(): Promise<DepsDescobrirCv> {
  const { createServiceClient } = await import('../src/lib/supabase/service')
  const { buscarFrotaRioQuality } = await import('../src/lib/kpi-rioquality/frota')
  const { buscarPosicoesPorCv } = await import('../src/lib/unitrac-api/posicoes')
  return {
    lerFrota: buscarFrotaRioQuality,
    buscarPosicoes: buscarPosicoesPorCv,
    async inserir(linhas) {
      // ignoreDuplicates: placa que entrou na frota nesse meio-tempo nao e' sobrescrita
      const { data, error } = await createServiceClient().from('kpi_rioquality_frota')
        .upsert(linhas, { onConflict: 'placa_norm', ignoreDuplicates: true }).select('placa_norm')
      if (error) throw new Error(`insercao na frota falhou: ${error.message}`)
      return (data ?? []).length
    },
    escrever: (c, t) => writeFileSync(c, t),
  }
}

async function main() {
  const [planilha] = process.argv.slice(2).filter(a => !a.startsWith('--'))
  if (!planilha) {
    console.error('Uso: descobrir-cv-rq.ts <planilha.xlsx> [--aplicar]')
    process.exit(1)
  }
  await rodar({ placas: await placasDaPlanilha(planilha), aplicar: process.argv.includes('--aplicar'), dirSaida: process.cwd() }, await depsReais())
}

const ehEntrypoint = (process.argv[1] ?? '').endsWith('descobrir-cv-rq.ts')
if (process.env.VITEST !== 'true' && ehEntrypoint) main().catch(e => { console.error(e); process.exit(1) })
