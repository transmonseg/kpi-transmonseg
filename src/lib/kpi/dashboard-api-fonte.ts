import type { SupabaseClient } from '@supabase/supabase-js'
import type { StatusRota } from './status-rota'
import type { StatusManual, EntradaManual } from './parse-kpi-manual'
import type { RotaKpi } from '@/lib/types/kpi'
import type { LinhaEscala } from '@/lib/types/escala'
import { buscarFrota, buscarPontos, buscarStopsCru, consolidaParadasApi, buscarAlvos, confirmaPorAlvo, buscarPosicoes, classificarPlacaViaApi } from '@/lib/unitrac-api'
import { cruzaEscalaUnitrac, setSemGeo, resolverLojaEsperada, type EscalaLinhaRow, type LojaRow, type GeoStore, type UnitracParadaRow } from '@/lib/kpi/matcher'
import { derivarStatus } from './status-rota'
import { situacaoViva, type SituacaoViva } from './situacao-viva'

export type EntradaApiDia = EntradaManual & { situacaoViva: SituacaoViva }

/** HH:MM em BRT (convenção do sistema: BRT mascarado como UTC). */
function fmtHora(d: Date | null | undefined): string | null {
  if (!d) return null
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

export function statusRotaParaDashboard(status: StatusRota): StatusManual {
  switch (status) {
    case 'ENTREGUE': case 'ENTREGUE_GEO': return 'entregue'
    case 'MUDOU_DE_ROTA': return 'mudou_de_rota'
    case 'DESATUALIZADO': return 'desatualizado'
    case 'SEM_RASTREADOR': return 'sem_rastreador'
    case 'FORA_DE_BASE': return 'em_rota'
    case 'NAO_SAIU_DA_BASE': case 'NAO_FOI_AO_CLIENTE': return 'nao_foi'
    default: return 'nao_foi'
  }
}

/** Converte uma rota+linha de escala+status numa linha do dashboard. */
export function rotaParaEntrada(
  rota: Pick<RotaKpi, 'placa_norm' | 'saida_cd' | 'chegada_base' | 'paradas'>,
  esc: Pick<LinhaEscala, 'rede_id' | 'loja_nome_raw' | 'motorista_nome'>,
  status: StatusRota,
  data: string,
): EntradaManual {
  const p0 = rota.paradas[0]
  const chegada = p0?.chegada ?? null
  const saida = chegada && p0?.duracao_min != null
    ? new Date(chegada.getTime() + p0.duracao_min * 60_000)
    : null
  return {
    data,
    rede_id: esc.rede_id,
    loja: esc.loja_nome_raw ?? '',
    placa: rota.placa_norm ?? null,
    motorista: esc.motorista_nome ?? null,
    status: statusRotaParaDashboard(status),
    saida_cd: fmtHora(rota.saida_cd ? new Date(rota.saida_cd) : null),
    chd: fmtHora(chegada),
    sai: fmtHora(saida),
    volta_base: fmtHora(rota.chegada_base ? new Date(rota.chegada_base) : null),
  }
}

// ── Storage do dia (bucket kpi-api-dash, 1 JSON por dia) ────────────────────────

export const BUCKET_API_DASH = 'kpi-api-dash'

/** Grava (upsert) as linhas de UM dia no bucket: {data}.json. */
export async function salvarDiaApi(svc: SupabaseClient, data: string, entradas: EntradaManual[]): Promise<void> {
  const blob = new Blob([JSON.stringify(entradas)], { type: 'application/json' })
  const { error } = await svc.storage.from(BUCKET_API_DASH).upload(`${data}.json`, blob, { upsert: true })
  if (error) throw new Error(`Falha ao salvar dia ${data}: ${error.message}`)
}

/** Resumo de risco do dia (derivado das paradas da API). Parada indevida = parada
 *  FORA_BASE (fora de loja e fora da base) de ≥10min: pra uma operação de segurança
 *  de carga, é o evento de risco do dia (caminhão parado onde não devia). */
export interface ResumoDiaApi {
  paradasIndevidas: number
  topIndevidas: Array<{ placa: string; hora: string; duracaoMin: number; local: string }>
  /** Pontos das paradas indevidas pro mapa (coordenada + duração). */
  pontosRisco: Array<{ placa: string; hora: string; duracaoMin: number; lat: number; lng: number }>
}

const RESUMO_VAZIO: ResumoDiaApi = { paradasIndevidas: 0, topIndevidas: [], pontosRisco: [] }

export async function salvarResumoDiaApi(svc: SupabaseClient, data: string, resumo: ResumoDiaApi): Promise<void> {
  const blob = new Blob([JSON.stringify(resumo)], { type: 'application/json' })
  const { error } = await svc.storage.from(BUCKET_API_DASH).upload(`${data}.resumo.json`, blob, { upsert: true })
  if (error) throw new Error(`Falha ao salvar resumo ${data}: ${error.message}`)
}

/** Soma os resumos de risco dos dias do intervalo (ignora dias sem arquivo). */
export async function carregarResumosApi(svc: SupabaseClient, ini: string, fim: string): Promise<ResumoDiaApi> {
  const datas = datasNoIntervalo(ini, fim)
  const lotes = await Promise.all(datas.map(async (dt) => {
    const { data: blob, error } = await svc.storage.from(BUCKET_API_DASH).download(`${dt}.resumo.json`)
    if (error || !blob) return null
    try { return JSON.parse(await blob.text()) as ResumoDiaApi } catch { return null }
  }))
  const validos = lotes.filter((r): r is ResumoDiaApi => r != null)
  if (!validos.length) return RESUMO_VAZIO
  return {
    paradasIndevidas: validos.reduce((s, r) => s + r.paradasIndevidas, 0),
    topIndevidas: validos.flatMap(r => r.topIndevidas).sort((a, b) => b.duracaoMin - a.duracaoMin).slice(0, 10),
    pontosRisco: validos.flatMap(r => r.pontosRisco ?? []).slice(0, 120),
  }
}

/** Enumera as datas YYYY-MM-DD de ini..fim (inclusive). */
export function datasNoIntervalo(ini: string, fim: string): string[] {
  const out: string[] = []
  const d = new Date(`${ini}T00:00:00Z`)
  const end = new Date(`${fim}T00:00:00Z`)
  while (d.getTime() <= end.getTime()) {
    out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

/** Lê e concatena as linhas dos dias do intervalo (ignora dias sem arquivo). */
export async function carregarEntradasApi(svc: SupabaseClient, ini: string, fim: string): Promise<EntradaManual[]> {
  const datas = datasNoIntervalo(ini, fim)
  const lotes = await Promise.all(datas.map(async (dt) => {
    const { data: blob, error } = await svc.storage.from(BUCKET_API_DASH).download(`${dt}.json`)
    if (error || !blob) return [] as EntradaManual[]
    try { return JSON.parse(await blob.text()) as EntradaManual[] } catch { return [] }
  }))
  return lotes.flat()
}

// ── Orquestrador do dia: escala + API → linhas do dashboard ─────────────────────

export type EscalaParaDia = Pick<EscalaLinhaRow, 'rede_id' | 'placa_norm' | 'loja_nome_raw' | 'loja_codigo_raw' | 'motorista_nome' | 'carro_ordem' | 'data_entrega'>

/** Calcula as linhas do dashboard de UM dia 100% pela API (paradas consolidadas +
 *  confirmação por alvo/NF), reusando o matcher de produção. */
export async function gerarDiaApi(
  svc: SupabaseClient,
  data: string,
  escala: EscalaParaDia[],
  lojas: LojaRow[],
  geoStores: GeoStore[],
): Promise<EntradaApiDia[]> {
  const escalaRows: EscalaLinhaRow[] = escala.map((l, i) => ({
    id: `e${i}`, rede_id: l.rede_id, placa_norm: l.placa_norm || null,
    loja_nome_raw: l.loja_nome_raw, loja_codigo_raw: l.loja_codigo_raw,
    motorista_nome: l.motorista_nome, carro_ordem: l.carro_ordem, data_entrega: l.data_entrega ?? data,
  }))
  const escMap = new Map(escalaRows.map((e, i) => [e.id, escala[i]]))

  const frota = await buscarFrota()
  const cvs = frota.map(v => v.cv)
  const [pontos, alvos, posicoes] = await Promise.all([buscarPontos(cvs), buscarAlvos(cvs), buscarPosicoes(cvs)])
  const frotaApiPlacas = new Set(frota.map(v => v.placaNorm))
  const placas = new Set(escalaRows.map(e => e.placa_norm).filter(Boolean) as string[])
  const paradaRows: UnitracParadaRow[] = []
  for (const v of frota) {
    if (!placas.has(v.placaNorm)) continue
    const ps = consolidaParadasApi(await buscarStopsCru(v.cv, 48), pontos, data, v.placaNorm)
    paradaRows.push(...ps)
  }

  setSemGeo(true)
  const rotas = await cruzaEscalaUnitrac(escalaRows, paradaRows, lojas, svc, geoStores, { geoEndereco: true })

  const porPlaca = new Map<string, UnitracParadaRow[]>()
  for (const p of paradaRows) { const a = porPlaca.get(p.placa_norm) ?? []; a.push(p); porPlaca.set(p.placa_norm, a) }
  const saiu = (pl: string | null) => !!pl && (porPlaca.get(pl) ?? []).some(p => p.classificacao === 'LOJA' || p.classificacao === 'FORA_BASE')

  const out: EntradaApiDia[] = []
  for (const rota of rotas) {
    const esc = escMap.get(rota.escala_linha_id)
    if (!esc) continue
    // Confirmação por alvo/NF: resgata entrega que o GPS perdeu.
    const esperada = resolverLojaEsperada({ rede_id: esc.rede_id, loja_codigo_raw: esc.loja_codigo_raw, loja_nome_raw: esc.loja_nome_raw }, lojas)
    if (esperada?.codigo_unitrac && rota.placa_norm) {
      const c = confirmaPorAlvo(rota.placa_unitrac ?? rota.placa_norm, esperada.codigo_unitrac, alvos)
      if (c && !rota.paradas.some(p => p.loja_id === esperada.id)) {
        const t = new Date(c.feitoISO + 'Z')
        rota.paradas = [{ parada_id: null, loja_id: esperada.id, nome: esperada.nome, chegada: t, saida: t, duracao_min: 0, classificacao: 'LOJA' }]
      }
      // NÃO usar `alvodatainicio` como saída CD: é a hora PLANEJADA da rota
      // (madrugada / 2ª viagem da noite), não a saída física — dava 00:35/23:28
      // contra o GPS (incidente dia 15). Removido das rotas; idem aqui no dashboard.
    }
    const placaUni = rota.placa_unitrac ?? rota.placa_norm
    const temGps = rota.paradas.length > 0 || porPlaca.has(placaUni ?? '')
    // Funil: placa fora do relatório classificada pela API (sem rastreador x
    // desatualizado x rastreado), pra não chamar desatualizado de "sem rastreador".
    const classApi = !temGps && rota.placa_norm ? classificarPlacaViaApi(rota.placa_norm, frotaApiPlacas, posicoes, data) : 'rastreado'
    const st = derivarStatus({
      temGps,
      ficouNaBase: rota.status === 'sem_entrega' && !!rota.placa_norm,
      paradas: rota.paradas.map(p => ({ classificacao: p.classificacao, loja_id: p.loja_id ?? null })),
      viaGeo: rota._matchMeta?.algorithm === 'geo', viaTroca: rota._matchMeta?.algorithm === 'troca',
      geoConfiavel: rota.geo_confiavel ?? false, placaFoiAlgumLugar: saiu(placaUni), placaSaiuDaBase: saiu(placaUni),
      placaDesatualizadaApi: classApi === 'desatualizado',
      placaTemRastreadorApi: classApi === 'rastreado' && !temGps,
      sugestaoTrocaAlta: rota.sugestao_confianca === 'alta' && rota.placa_sugerida
        ? { placa: rota.placa_sugerida, hora: rota.sugestao_hora ?? null }
        : null,
    })
    const ent = rotaParaEntrada(rota, esc, st.status, data)
    const sv = situacaoViva({
      entregue: st.status === 'ENTREGUE' || st.status === 'ENTREGUE_GEO',
      naApi: !!placaUni && porPlaca.has(placaUni),
      saiuDaBase: saiu(placaUni),
    })
    out.push({ ...ent, situacaoViva: sv })
  }

  // Resumo de risco do dia: paradas indevidas = paradas FORA_BASE de ≥10min (caminhão
  // parado fora de loja e fora da base). consolidaParadasApi já descartou blips <5min.
  const indevidas = paradaRows
    .filter(p => p.classificacao === 'FORA_BASE' && (p.duracao_seg ?? 0) >= 600)
    .sort((a, b) => (b.duracao_seg ?? 0) - (a.duracao_seg ?? 0))
  const resumo: ResumoDiaApi = {
    paradasIndevidas: indevidas.length,
    topIndevidas: indevidas.slice(0, 10).map(p => ({
      placa: p.placa_norm,
      hora: fmtHora(new Date(p.chegada)) ?? '',
      duracaoMin: Math.round((p.duracao_seg ?? 0) / 60),
      local: p.local_parada ?? 'Fora de base',
    })),
    pontosRisco: indevidas
      .filter(p => p.lat != null && p.lng != null && Math.abs(p.lat) > 1)
      .slice(0, 120)
      .map(p => ({
        placa: p.placa_norm,
        hora: fmtHora(new Date(p.chegada)) ?? '',
        duracaoMin: Math.round((p.duracao_seg ?? 0) / 60),
        lat: p.lat as number,
        lng: p.lng as number,
      })),
  }
  await salvarResumoDiaApi(svc, data, resumo)

  return out
}
