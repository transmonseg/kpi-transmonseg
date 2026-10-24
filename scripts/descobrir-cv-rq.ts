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
//   npx tsx --env-file=.env.production scripts/descobrir-cv-rq.ts --dias 3 --aplicar [--saida <dir>]   (cron, F2-15)
//   (--dias sem --saida grava o CSV no diretorio temporario; a varredura roda
//   no maximo 1x por dia para as mesmas placas -- marca em /tmp, F2-REV-10)
//
// --aplicar insere em kpi_rioquality_frota SO' as propostas "ok" (as
// "conferir" ficam pra pessoa decidir) e nunca mexe em placa ja' cadastrada.
//
// F2-15 (MON-12, plano mestre 23/10): a frota estava parada desde 02/10 (a
// descoberta era manual) e o monitoramento tem uma copia de 06/10. Modo cron
// (--dias N): as placas vem do relatorio da RQ guardado no Ao vivo
// (kpi_ao_vivo_dia) dos ultimos N dias, sem a placa de preenchimento (XXX).
// Com --aplicar, depois de inserir, a frota inteira vai ao monitoramento
// (POST /api/veiculos/rioquality, que so' acrescenta o cv que falta);
// monitoramento antigo ou fora do ar so' gera aviso no log.
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { haversine } from '../src/lib/utils/geo'
import { normPlaca } from '../src/lib/unitrac-api/frota'
import type { PosicaoPorCv } from '../src/lib/unitrac-api/posicoes'
import { BASE_COORD_RIOQUALITY } from '../src/lib/kpi-rioquality/constants'
import { placaFicticia } from '../src/lib/kpi-rioquality/fonte-fusion'

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
  /** F2-15: frota inteira ao monitoramento (so' com --aplicar). Devolve o resumo para o log. */
  enviarMonitoramento?: (frota: Map<string, string>) => Promise<string>
  /** F2-REV-10: marca da ultima varredura completa (dia BRT + placas sem cv varridas). */
  lerMarca?: () => MarcaVarredura | null
  gravarMarca?: (m: MarcaVarredura) => void
}

export type MarcaVarredura = { data: string; placas: string[] }

/** F2-REV-10: --dias (cron) sem --saida grava no diretorio temporario, nunca
 *  no cwd (/srv/kpi-transmonseg); a planilha (uso manual) continua no cwd. */
export function dirSaidaPadrao(a: ArgsDescobrir): string {
  return a.saida ?? (a.dias != null ? tmpdir() : process.cwd())
}

/** F2-15: placas dos relatorios da RQ guardados (um array por dia), sem a de
 *  preenchimento (XXX5678 em 15/10) e sem vazia. */
export function placasDoRomaneioRq(dias: { placaNorm?: string | null }[][]): Set<string> {
  const out = new Set<string>()
  for (const dia of dias) for (const e of dia) {
    const p = normPlaca(e.placaNorm ?? '')
    if (p && !placaFicticia(p)) out.add(p)
  }
  return out
}

export type ArgsDescobrir = { planilha: string | null; dias: number | null; aplicar: boolean; saida: string | null }
const USO = 'Uso: descobrir-cv-rq.ts <planilha.xlsx> [--aplicar]  |  descobrir-cv-rq.ts --dias N [--aplicar] [--saida <dir>]'

export function lerArgs(argv: string[]): ArgsDescobrir {
  const r: ArgsDescobrir = { planilha: null, dias: null, aplicar: false, saida: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--aplicar') r.aplicar = true
    else if (a === '--dias') {
      const n = Number(argv[++i])
      if (!Number.isInteger(n) || n < 1 || n > 31) throw new Error(USO)
      r.dias = n
    } else if (a === '--saida') r.saida = argv[++i] ?? null
    else if (!a.startsWith('--') && !r.planilha) r.planilha = a
  }
  if (!r.planilha && r.dias == null) throw new Error(USO)
  return r
}

/** F2-15: manda a frota (placa -> cv) ao monitoramento. Nunca lanca: rota
 *  ausente (monitoramento antigo, 404) ou fora do ar vira texto pro log. */
export async function enviarFrotaMonitoramento(frota: Map<string, string>, o: { base: string; chave: string; fetch?: typeof fetch }): Promise<string> {
  const f = o.fetch ?? fetch
  try {
    const r = await f(`${o.base}/api/veiculos/rioquality`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-motor-key': o.chave },
      body: JSON.stringify({ veiculos: [...frota].map(([placa, cv]) => ({ placa, cv })) }),
      signal: AbortSignal.timeout(30_000),
    })
    if (r.status === 404) return 'monitoramento sem a rota /api/veiculos/rioquality (versão antiga): frota não enviada'
    const j = await r.json().catch(() => null) as { ok?: boolean; inseridos?: string[]; jaExistiam?: number; conflitos?: { placa: string; motivo: string }[]; erro?: string } | null
    if (!r.ok || !j?.ok) return `monitoramento recusou a frota (HTTP ${r.status}${j?.erro ? `: ${j.erro}` : ''})`
    const ins = j.inseridos ?? []
    const conf = j.conflitos ?? []
    return `monitoramento: ${ins.length} inserido(s)${ins.length ? ` (${ins.join(', ')})` : ''}, ${j.jaExistiam ?? 0} já existia(m)`
      + (conf.length ? `, ${conf.length} conflito(s): ${conf.map(c => `${c.placa} (${c.motivo})`).join('; ')}` : '')
  } catch (e) {
    return `monitoramento fora do ar, frota não enviada (${e instanceof Error ? e.message : String(e)})`
  }
}

export async function rodar(
  opcoes: { placas: Set<string>; aplicar: boolean; dirSaida: string; maxCv?: number
    /** F2-REV-10: dia BRT de hoje -- liga a marca (no maximo 1 varredura por dia
     *  para as mesmas placas; placa nova varre na hora). */
    hoje?: string },
  deps: DepsDescobrirCv,
): Promise<{ semCv: number; ok: number; conferir: number; naoEncontradas: number; inseridos: number }> {
  const frota = await deps.lerFrota()
  const semCv = [...opcoes.placas].map(normPlaca).filter(p => p && !frota.has(p)).sort()
  console.log(`${opcoes.placas.size} placa(s) na planilha, ${semCv.length} fora da frota: ${semCv.join(', ')}`)
  // F2-15: com --aplicar a frota (relida se mudou) vai ao monitoramento.
  const enviar = async (mudou: boolean) => {
    if (!opcoes.aplicar || !deps.enviarMonitoramento) return
    console.log(await deps.enviarMonitoramento(mudou ? await deps.lerFrota() : frota))
  }
  if (semCv.length === 0) {
    await enviar(false)
    return { semCv: 0, ok: 0, conferir: 0, naoEncontradas: 0, inseridos: 0 }
  }
  // F2-REV-10: as placas que sobram sem cv (KZA2F01: sem rastreador de
  // verdade) nao disparam 52 chamadas a' Unitrac em todo cron -- so' placa
  // nova desde a ultima varredura ou o primeiro cron do dia.
  // So' no cron (--aplicar): uma rodada a seco nao segura a que insere.
  const usaMarca = !!opcoes.hoje && opcoes.aplicar
  const marca = usaMarca ? deps.lerMarca?.() ?? null : null
  if (usaMarca && marca?.data === opcoes.hoje && semCv.every(p => marca.placas.includes(p))) {
    console.log(`varredura pulada: ${semCv.join(', ')} já varrida(s) hoje (${marca.data}) sem placa nova -- próxima varredura amanhã ou com placa nova`)
    await enviar(false)
    return { semCv: semCv.length, ok: 0, conferir: 0, naoEncontradas: 0, inseridos: 0 }
  }
  const posicoes = await varrerCvs(deps.buscarPosicoes, opcoes.maxCv ?? MAX_CV_PADRAO)
  console.log(`varredura: ${posicoes.size} CV(s) responderam`)
  if (usaMarca) deps.gravarMarca?.({ data: opcoes.hoje!, placas: semCv })
  const propostas = proporCvs(semCv, posicoes)
  const caminho = `${opcoes.dirSaida}/descobrir-cv-rq-propostas.csv`
  deps.escrever(caminho, csvPropostasCv(propostas))
  for (const p of propostas) console.log(`  ${p.placa}: ${p.situacao}${p.cv ? ` CV ${p.cv}` : ''} -- ${p.motivo}`)
  const ok = propostas.filter(p => p.situacao === 'ok')
  const resumo = { semCv: semCv.length, ok: ok.length, conferir: propostas.filter(p => p.situacao === 'conferir').length, naoEncontradas: propostas.filter(p => p.situacao === 'nao_encontrada').length, inseridos: 0 }
  console.log(`propostas em ${caminho}`)
  if (!opcoes.aplicar || ok.length === 0) {
    if (!opcoes.aplicar) console.log('(sem --aplicar: nada inserido)')
    await enviar(false)
    return resumo
  }
  const inseridos = await deps.inserir(ok.map(p => ({ placa_norm: p.placa, cv: p.cv!, nome: null })))
  console.log(`inseridos ${inseridos}/${ok.length} em kpi_rioquality_frota`)
  await enviar(inseridos > 0)
  return { ...resumo, inseridos }
}

async function placasDaPlanilha(caminho: string): Promise<Set<string>> {
  const { parseEntregasCompletas, parseEntregas } = await import('../src/lib/kpi-rioquality/parse-planilhas')
  const buf = readFileSync(caminho)
  const completas = parseEntregasCompletas(buf)
  const placas = completas.length > 0 ? completas.map(e => e.placaNorm) : parseEntregas(buf).map(e => e.placaNorm)
  return new Set(placas.filter(Boolean))
}

const ARQ_MARCA = join(tmpdir(), 'descobrir-cv-rq-ultima-varredura.json')

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
    lerMarca: () => {
      try { return existsSync(ARQ_MARCA) ? JSON.parse(readFileSync(ARQ_MARCA, 'utf8')) as MarcaVarredura : null } catch { return null }
    },
    gravarMarca: m => {
      try { writeFileSync(ARQ_MARCA, JSON.stringify({ ...m, em: new Date().toISOString() })) } catch (e) { console.log(`marca da varredura não gravada (${e instanceof Error ? e.message : String(e)})`) }
    },
    enviarMonitoramento: frota => {
      const chave = process.env.MOTOR_SECRET
      if (!chave) return Promise.resolve('MOTOR_SECRET ausente: frota não enviada ao monitoramento')
      return enviarFrotaMonitoramento(frota, { base: process.env.MONITORAMENTO_URL ?? 'http://127.0.0.1:3010', chave })
    },
  }
}

/** F2-15: placas do relatorio da RQ guardado no Ao vivo dos ultimos N dias (hoje incluso). */
async function placasDosUltimosDias(dias: number): Promise<Set<string>> {
  const { createServiceClient } = await import('../src/lib/supabase/service')
  const { hojeBR } = await import('../src/lib/data-br')
  const hoje = hojeBR()
  const desde = new Date(Date.parse(`${hoje}T12:00:00Z`) - (dias - 1) * 86_400_000).toISOString().slice(0, 10)
  const { data, error } = await createServiceClient().from('kpi_ao_vivo_dia').select('data, romaneio')
    .eq('cliente', 'rioquality').gte('data', desde).lte('data', hoje)
  if (error) throw new Error(`relatórios da RQ não lidos: ${error.message}`)
  console.log(`relatórios da RQ de ${desde} a ${hoje}: ${(data ?? []).map(d => d.data).join(', ') || 'nenhum'}`)
  return placasDoRomaneioRq((data ?? []).map(d => (Array.isArray(d.romaneio) ? d.romaneio : []) as { placaNorm?: string }[]))
}

async function main() {
  let args: ArgsDescobrir
  try {
    args = lerArgs(process.argv.slice(2))
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e))
    process.exit(1)
  }
  console.log(`[${new Date().toISOString()}] descobrir-cv-rq ${args.planilha ?? `--dias ${args.dias}`}${args.aplicar ? ' --aplicar' : ''}`)
  const placas = args.planilha ? await placasDaPlanilha(args.planilha) : await placasDosUltimosDias(args.dias!)
  const { hojeBR } = await import('../src/lib/data-br')
  await rodar({ placas, aplicar: args.aplicar, dirSaida: dirSaidaPadrao(args), ...(args.dias != null ? { hoje: hojeBR() } : {}) }, await depsReais())
}

const ehEntrypoint = (process.argv[1] ?? '').endsWith('descobrir-cv-rq.ts')
if (process.env.VITEST !== 'true' && ehEntrypoint) main().catch(e => { console.error(e); process.exit(1) })
