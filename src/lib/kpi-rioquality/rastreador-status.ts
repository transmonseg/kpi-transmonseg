import { haversine } from '@/lib/utils/geo'
import type { MedicaoRastro } from './km-rastro'
import { BASE_COORD_RIOQUALITY } from './constants'

// Rotulos de rastreador da Rio Quality (relatorio rq-mesmo-lugar-e-sem-
// rastreador.md, 01/10, PARTE B). Os dois saem FORA da taxa (prefixo SEM
// RASTREADOR + temRastreador=false, ver gerador-xlsx.ts) e nunca "NAO SAIU
// DA BASE":
//  - GPS CONGELADO (LNH8A80): o rastreador comunica, mas todos os pontos do
//    dia sao a MESMA coordenada, longe da base (Duque de Caxias, ~17 km).
//    Caminhao parado NA base tambem repete a coordenada -- esse segue "NAO
//    SAIU DA BASE" (indistinguivel de GPS congelado na base).
//  - SEM COMUNICAR DESDE DD/MM (RJM5B51): ultimo GPS (posicoes/N/N, datagps)
//    anterior ao inicio do dia.

export const OBS_GPS_CONGELADO = 'SEM RASTREADOR - GPS CONGELADO'
export function obsSemComunicarDesde(ddmm: string): string {
  return `SEM RASTREADOR - SEM COMUNICAR DESDE ${ddmm}`
}

/** Coordenada unica a mais que isto da base = GPS congelado. */
export const DIST_MIN_BASE_CONGELADO_M = 1_000

export function gpsCongelado(m: MedicaoRastro): boolean {
  const c = m.coordenadaUnicaNoDia
  if (!c) return false
  return haversine(c.lat, c.lng, BASE_COORD_RIOQUALITY.lat, BASE_COORD_RIOQUALITY.lng) > DIST_MIN_BASE_CONGELADO_M
}

/** "DD/MM" do ultimo GPS quando ele e' anterior a 00:00 (BRT) do dia `data`
 *  (YYYY-MM-DD); null quando comunicou no dia/depois ou a data nao parseia. */
export function semComunicarDesde(datagps: string | null, data: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/.exec(datagps ?? '')
  if (!m) return null
  const [, dd, mm, yyyy, hh, mi, ss] = m
  const t = new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss ?? '00'}-03:00`).getTime()
  const inicioDia = new Date(`${data}T00:00:00-03:00`).getTime()
  if (!Number.isFinite(t) || !Number.isFinite(inicioDia)) return null
  return t < inicioDia ? `${dd}/${mm}` : null
}
