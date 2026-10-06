import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import { sugerirTrocas, type SugestaoTroca } from './sugerir-trocas'
// KPI ao vivo: leitura/gravação no banco e o cálculo. O cálculo é a MESMA
// função da geração normal (gerarKpiNutrimax); a tela lê só o resultado
// gravado aqui, nunca recalcula por conta própria.
import { createServiceClient } from '@/lib/supabase/service'
import { gerarKpiNutrimax, type EntradaKpiNutrimax } from './gerar-nutrimax'
import { extrairKpiCompleto } from './resumo-dashboard'
import { resumirPlacas, paradaDaChegada, paradaEmAndamento, nfProxima, type PlacaAoVivo } from './ao-vivo'
import { normPlaca } from '@/lib/unitrac-api'
import type { LinhaEscala, LinhaRomaneio } from './types'
import { gerarKpiRioQuality } from '@/lib/kpi-rioquality/pipeline'
import { buscarFrotaRioQuality } from '@/lib/kpi-rioquality/frota'
import { foraDoAlcanceApi } from './constants'
import { lerSnapshotParadas } from './paradas-snapshot'
import { EMPRESA_SNAPSHOT_RIOQUALITY } from '@/lib/kpi-rioquality/snapshot-paradas'
import { hojeBR } from '@/lib/data-br'
import type { EntregaRioQualityCompleta } from '@/lib/kpi-rioquality/parse-planilhas'

export const CLIENTES_AO_VIVO = ['nutrimax', 'rioquality'] as const
export const NOME_CLIENTE_AO_VIVO: Record<ClienteAoVivo, string> = { nutrimax: 'Nutry Max', rioquality: 'Rio Quality' }
export type ClienteAoVivo = (typeof CLIENTES_AO_VIVO)[number]
export const clienteAoVivoValido = (c: string | null): c is ClienteAoVivo => (CLIENTES_AO_VIVO as readonly string[]).includes(c ?? '')

/** Planilha do último cálculo (uma por cliente/dia, sobrescrita a cada 10
 *  min): "Gerar KPI agora" devolve ela na hora. Apagada depois de 7 dias. */
const BUCKET_AO_VIVO = 'kpi-romaneio-inputs'
export const caminhoXlsxAoVivo = (cliente: ClienteAoVivo, data: string) => `ao-vivo/${cliente}/${data}.xlsx`
const XLSX_AO_VIVO_VALIDO_MS = 10 * 60_000

/** Planilha do último cálculo se ele tem menos de 10 min; senão null. */
export async function xlsxRecenteAoVivo(cliente: ClienteAoVivo, data: string): Promise<{ xlsx: Buffer; calculadoEm: string } | null> {
  const svc = createServiceClient()
  const { data: c } = await svc.from('kpi_ao_vivo_calculo').select('calculado_em').eq('cliente', cliente).eq('data', data).maybeSingle()
  const em = c?.calculado_em as string | undefined
  if (!em || Date.now() - Date.parse(em) > XLSX_AO_VIVO_VALIDO_MS) return null
  const { data: arq, error } = await svc.storage.from(BUCKET_AO_VIVO).download(caminhoXlsxAoVivo(cliente, data))
  if (error || !arq) return null
  return { xlsx: Buffer.from(await arq.arrayBuffer()), calculadoEm: em }
}

/** Apaga planilhas do ao vivo com mais de 7 dias. */
export async function limparXlsxAoVivo(hoje: string): Promise<void> {
  const svc = createServiceClient()
  const d = new Date(`${hoje}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 7)
  const limite = d.toISOString().slice(0, 10)
  for (const cliente of CLIENTES_AO_VIVO) {
    const { data: arqs } = await svc.storage.from(BUCKET_AO_VIVO).list(`ao-vivo/${cliente}`, { limit: 1000 })
    const velhos = (arqs ?? []).filter(a => a.name.slice(0, 10) < limite).map(a => `ao-vivo/${cliente}/${a.name}`)
    if (velhos.length) await svc.storage.from(BUCKET_AO_VIVO).remove(velhos)
  }
}

/** Cálculo travado há mais que isso é considerado morto (processo caiu). */
const TRAVA_EXPIRA_MIN = 15

export type ResultadoAoVivo = {
  calculadoEm: string
  resumo: { taxa: number | null; entregues: number | null; nfsNaConta: number | null; aguardando: number; totalNfs: number; feitas: number; pct: number }
  placas: PlacaAoVivo[]
  /** Carro trocado sem aviso (06/10): sugestões pra operação confirmar. */
  sugestoesTroca?: SugestaoTroca[]
}

export type DiaAoVivo = {
  enviadoEm: string
  enviadoPor: string | null
  nfs: number
  placas: number
  escalaEnviada: boolean
  paoEnviado: boolean
}

export type EstadoAoVivo = {
  dia: DiaAoVivo | null
  resultado: ResultadoAoVivo | null
  calculando: boolean
  ultimoErro: { mensagem: string; em: string } | null
}

export async function guardarDiaAoVivo(p: {
  cliente: ClienteAoVivo
  data: string
  escala: LinhaEscala[]
  /** Nutry Max: LinhaRomaneio[] lido dos PDFs. Rio Quality: as entregas lidas
   *  do Relatório de Entregas (EntregaRioQualityCompleta[]). */
  romaneio: LinhaRomaneio[] | EntregaRioQualityCompleta[]
  pao: { linhas: LinhaRomaneio[]; escala: LinhaEscala[] }
  escalaEnviada: boolean
  paoEnviado: boolean
  enviadoPor: string | null
}): Promise<void> {
  const { error } = await createServiceClient().from('kpi_ao_vivo_dia').upsert({
    cliente: p.cliente, data: p.data, romaneio: p.romaneio, escala: p.escala, pao: p.pao,
    escala_enviada: p.escalaEnviada, pao_enviado: p.paoEnviado, enviado_por: p.enviadoPor, enviado_em: new Date().toISOString(),
  }, { onConflict: 'cliente,data' })
  if (error) throw new Error(`guardar romaneio do dia: ${error.message}`)
}

export async function lerEstadoAoVivo(cliente: ClienteAoVivo, data: string): Promise<EstadoAoVivo> {
  const svc = createServiceClient()
  const [d, c] = await Promise.all([
    svc.from('kpi_ao_vivo_dia').select('romaneio, pao, escala_enviada, pao_enviado, enviado_por, enviado_em').eq('cliente', cliente).eq('data', data).maybeSingle(),
    svc.from('kpi_ao_vivo_calculo').select('resultado, ultimo_erro, ultimo_erro_em, rodando_desde').eq('cliente', cliente).eq('data', data).maybeSingle(),
  ])
  if (d.error) throw new Error(d.error.message)
  if (c.error) throw new Error(c.error.message)
  let dia: DiaAoVivo | null = null
  if (d.data) {
    const linhas: { placa?: string; placaNorm?: string }[] = [...(d.data.romaneio as { placa?: string; placaNorm?: string }[]), ...((d.data.pao as { linhas: LinhaRomaneio[] }).linhas ?? [])]
    dia = {
      enviadoEm: d.data.enviado_em as string,
      enviadoPor: (d.data.enviado_por as string | null) ?? null,
      nfs: linhas.length,
      placas: new Set(linhas.map(l => l.placa ?? l.placaNorm)).size,
      escalaEnviada: !!d.data.escala_enviada,
      paoEnviado: !!d.data.pao_enviado,
    }
  }
  const rodando = c.data?.rodando_desde as string | null | undefined
  return {
    dia,
    resultado: (c.data?.resultado as ResultadoAoVivo | null) ?? null,
    calculando: !!rodando && Date.now() - Date.parse(rodando) < TRAVA_EXPIRA_MIN * 60_000,
    ultimoErro: c.data?.ultimo_erro ? { mensagem: c.data.ultimo_erro as string, em: c.data.ultimo_erro_em as string } : null,
  }
}

/** Trava entre processos (servidor e cron): só um cálculo por cliente/dia. */
async function travar(cliente: ClienteAoVivo, data: string): Promise<boolean> {
  const svc = createServiceClient()
  await svc.from('kpi_ao_vivo_calculo').upsert({ cliente, data }, { onConflict: 'cliente,data', ignoreDuplicates: true })
  const limite = new Date(Date.now() - TRAVA_EXPIRA_MIN * 60_000).toISOString()
  const { data: linhas, error } = await svc.from('kpi_ao_vivo_calculo')
    .update({ rodando_desde: new Date().toISOString() })
    .eq('cliente', cliente).eq('data', data)
    .or(`rodando_desde.is.null,rodando_desde.lt.${limite}`)
    .select('cliente')
  if (error) throw new Error(`trava do calculo: ${error.message}`)
  return (linhas ?? []).length > 0
}

export async function entradaDoDia(cliente: ClienteAoVivo, data: string): Promise<EntradaKpiNutrimax | null> {
  const { data: d, error } = await createServiceClient().from('kpi_ao_vivo_dia')
    .select('romaneio, escala, pao, escala_enviada, pao_enviado').eq('cliente', cliente).eq('data', data).maybeSingle()
  if (error) throw new Error(error.message)
  if (!d) return null
  return {
    data,
    romaneio: d.romaneio as LinhaRomaneio[],
    escala: d.escala as LinhaEscala[],
    pao: d.pao as { linhas: LinhaRomaneio[]; escala: LinhaEscala[] },
    escalaEnviada: !!d.escala_enviada,
    paoEnviado: !!d.pao_enviado,
  }
}

/** Rio Quality: as entregas lidas de manhã (Relatório de Entregas). */
export async function entradaRioQualityDoDia(data: string): Promise<EntregaRioQualityCompleta[] | null> {
  const { data: d, error } = await createServiceClient().from('kpi_ao_vivo_dia').select('romaneio').eq('cliente', 'rioquality').eq('data', data).maybeSingle()
  if (error) throw new Error(error.message)
  return d ? (d.romaneio as EntregaRioQualityCompleta[]) : null
}

/** KPI do dia com o que foi guardado de manhã (mesma geração da tela
 *  "Gerar KPI" de cada cliente). null = romaneio do dia não subido. */
export async function gerarKpiDoDia(cliente: ClienteAoVivo, data: string, log: (m: string) => void = () => {},
  aoMontarDetalheNutry?: Parameters<typeof gerarKpiNutrimax>[1],
  aoParadasRq?: (paradasPorPlaca: Map<string, UnitracParadaRow[]>) => void): Promise<{ xlsx: Buffer; qtdCargas: number } | null> {
  if (cliente === 'rioquality') {
    const entregas = await entradaRioQualityDoDia(data)
    if (!entregas) return null
    // Mesma regra da rota rioquality/gerar: dia fora das 48h da Unitrac usa o
    // snapshot noturno de paradas.
    let lerSnapshot: (() => Promise<Awaited<ReturnType<typeof lerSnapshotParadas>>>) | undefined
    if (foraDoAlcanceApi(data, hojeBR())) {
      const snap = await lerSnapshotParadas(EMPRESA_SNAPSHOT_RIOQUALITY, data)
      if (snap.size > 0) lerSnapshot = async () => snap
    }
    const r = await gerarKpiRioQuality({ entregasCompletas: entregas, data, cvPorPlaca: await buscarFrotaRioQuality(), log, lerSnapshot, aoParadas: aoParadasRq })
    return { xlsx: r.xlsx, qtdCargas: r.linhasKpi.length }
  }
  const entrada = await entradaDoDia(cliente, data)
  if (!entrada) return null
  const r = await gerarKpiNutrimax(entrada, aoMontarDetalheNutry)
  return { xlsx: r.xlsx, qtdCargas: r.qtdCargasNutry }
}

/** Resultado da tela a partir da planilha do KPI lida (extrairKpiCompleto).
 *  Usado pelo cálculo ao vivo e pelo histórico (planilha guardada). */
export function montarResultadoAoVivo(data: string, lido: Awaited<ReturnType<typeof extrairKpiCompleto>>, coords: Map<string, { lat: number; lng: number }>, calculadoEm: string, paradas?: Map<string, { lat: number; lng: number }>): ResultadoAoVivo {
  const placas = resumirPlacas(data, lido.nfs, lido.resumo.cargas, coords, paradas)
  const totalNfs = placas.reduce((s, p) => s + p.total, 0)
  const feitas = placas.reduce((s, p) => s + p.feitas, 0)
  return {
    calculadoEm,
    resumo: {
      taxa: lido.resumo.taxa, entregues: lido.resumo.entregues, nfsNaConta: lido.resumo.nfsNaConta,
      aguardando: lido.resumo.aguardando ?? 0, totalNfs, feitas, pct: totalNfs ? Math.round((100 * feitas) / totalNfs) : 0,
    },
    placas,
  }
}

/** Roda o KPI com o romaneio guardado e grava o resultado da tela.
 *  Outro cálculo rodando: não faz nada ('ocupado'). Sem romaneio: 'sem_romaneio'. */
export async function calcularAoVivo(cliente: ClienteAoVivo, data: string, log: (m: string) => void = () => {}): Promise<'ok' | 'ocupado' | 'sem_romaneio' | 'erro'> {
  const temDia = cliente === 'rioquality' ? await entradaRioQualityDoDia(data) : await entradaDoDia(cliente, data)
  if (!temDia) return 'sem_romaneio'
  if (!(await travar(cliente, data))) return 'ocupado'
  const svc = createServiceClient()
  const t0 = Date.now()
  try {
    const coords = new Map<string, { lat: number; lng: number }>()
    const paradasNf = new Map<string, { lat: number; lng: number }>()
    // Parada em andamento por placa (aviso de +1 h no cliente, 06/10).
    const paradaAtualPorPlaca = new Map<string, { inicio: string; lat: number | null; lng: number | null }>()
    let sugestoesTroca: SugestaoTroca[] = []
    const ehHoje = data === hojeBR()
    const r = await gerarKpiDoDia(cliente, data, log, {
      aoMontarDetalhe: ({ romaneioGeo, detalhe, paradasPorPlaca }) => {
        for (const l of romaneioGeo) if (l.lat != null && l.lng != null) coords.set(l.nf, { lat: l.lat, lng: l.lng })
        // Ponto da parada que o KPI contou como entrega ("Ver no monitoramento").
        for (const d of detalhe) {
          const p = paradaDaChegada(paradasPorPlaca.get(normPlaca(d.placa)) ?? [], d.chegada)
          if (p) paradasNf.set(d.nf, p)
        }
        if (ehHoje) for (const [placaNorm, ps] of paradasPorPlaca) {
          const pa = paradaEmAndamento(ps, Date.now())
          if (pa) paradaAtualPorPlaca.set(placaNorm, pa)
        }
        if (ehHoje) {
          const pontos = romaneioGeo.filter(l => l.lat != null && l.lng != null)
            .map(l => ({ carga: l.carga, placa: normPlaca(l.placa), endereco: l.endereco, lat: l.lat as number, lng: l.lng as number }))
          sugestoesTroca = sugerirTrocas(pontos, paradasPorPlaca)
        }
      },
    }, paradasRq => {
      // Rio Quality (06/10, pedido da tia Érica): mesmo aviso de +1 h no cliente.
      if (ehHoje) for (const [placaNorm, ps] of paradasRq) {
        const pa = paradaEmAndamento(ps, Date.now())
        if (pa) paradaAtualPorPlaca.set(placaNorm, pa)
      }
    })
    if (!r) throw new Error('romaneio do dia sumiu durante o cálculo')
    // Planilha do cálculo guardada (sobrescreve a anterior do dia).
    const up = await svc.storage.from(BUCKET_AO_VIVO).upload(caminhoXlsxAoVivo(cliente, data), r.xlsx, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', upsert: true,
    })
    if (up.error) log(`ao vivo ${cliente} ${data}: planilha não guardada (${up.error.message})`)
    const resultado = montarResultadoAoVivo(data, await extrairKpiCompleto(r.xlsx), coords, new Date().toISOString(), paradasNf)
    if (sugestoesTroca.length > 0) resultado.sugestoesTroca = sugestoesTroca
    for (const p of resultado.placas) {
      const pa = paradaAtualPorPlaca.get(normPlaca(p.placa))
      if (!pa) continue
      // Sem rastreador no dia (06/10, TOS0H81: GPS parado havia 23 h): a
      // "parada" e' a ultima posicao velha, nao o carro no cliente agora.
      if (p.nfs.length > 0 && p.nfs.every(n => n.situacao === 'sem_rastreador')) continue
      // Rota acabou (06/10: RQM4C16 6/6 parado em casa, RBJ7H78 parado no patio
      // depois de voltar): sem nota pendente, ou a parada comecou depois da
      // volta a base -- nao e' "no cliente".
      if (!p.nfs.some(n => n.situacao === 'pendente')) continue
      if (p.chegadaBase && Date.parse(pa.inicio) >= Date.parse(p.chegadaBase)) continue
      const n = pa.lat != null && pa.lng != null ? nfProxima(p.nfs, { lat: pa.lat, lng: pa.lng }) : null
      p.paradaAtual = { inicio: pa.inicio, nf: n?.nf ?? null, cliente: n?.cliente ?? null }
    }
    const { error } = await svc.from('kpi_ao_vivo_calculo').update({
      resultado, calculado_em: resultado.calculadoEm, duracao_ms: Date.now() - t0, rodando_desde: null,
    }).eq('cliente', cliente).eq('data', data)
    if (error) throw new Error(error.message)
    log(`ao vivo ${cliente} ${data}: ok em ${Math.round((Date.now() - t0) / 1000)}s (${resultado.resumo.feitas}/${resultado.resumo.totalNfs})`)
    return 'ok'
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log(`ao vivo ${cliente} ${data}: ERRO ${msg}`)
    await svc.from('kpi_ao_vivo_calculo').update({ ultimo_erro: msg.slice(0, 500), ultimo_erro_em: new Date().toISOString(), rodando_desde: null }).eq('cliente', cliente).eq('data', data)
    return 'erro'
  }
}
