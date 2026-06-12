import type { SupabaseClient } from '@supabase/supabase-js'
import type { StatusRota } from './status-rota'
import type { StatusManual, EntradaManual } from './parse-kpi-manual'
import type { RotaKpi } from '@/lib/types/kpi'
import type { LinhaEscala } from '@/lib/types/escala'

/** HH:MM em BRT (convenção do sistema: BRT mascarado como UTC). */
function fmtHora(d: Date | null | undefined): string | null {
  if (!d) return null
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

export function statusRotaParaDashboard(status: StatusRota): StatusManual {
  if (status === 'ENTREGUE' || status === 'ENTREGUE_GEO') return 'entregue'
  if (status === 'SEM_RASTREADOR') return 'sem_rastreador'
  return 'nao_foi'
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
