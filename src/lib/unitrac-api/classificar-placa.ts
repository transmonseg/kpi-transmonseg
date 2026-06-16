import type { MapaPosicoes } from './posicoes'
import { variantesPlaca } from '@/lib/kpi/matcher'

export type ClassificacaoPlaca = 'sem_rastreador' | 'desatualizado' | 'rastreado'

/** Data BR "DD/MM/YYYY HH:MM:SS" → "YYYY-MM-DD" (só a parte da data). */
function diaDoDatagps(datagps: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(datagps.trim())
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

/**
 * Classifica uma placa da escala que NÃO foi achada no relatório Unitrac:
 *  - não está na frota da API → SEM RASTREADOR (não tem equipamento)
 *  - está na frota + sem transmitir no dia (última posição de outro dia ou ausente)
 *    → DESATUALIZADO (tem equipamento, precisa manutenção)
 *  - está na frota + transmitiu no dia → RASTREADO (tem rastreador ok, cai no status normal)
 * Usa variantes (Mercosul/OCR) pra casar placa antiga da escala com a da frota.
 */
export function classificarPlacaViaApi(
  placaNorm: string,
  frotaPlacas: Set<string>,
  posicoes: MapaPosicoes,
  dataRef: string,
): ClassificacaoPlaca {
  const variantes = [placaNorm, ...variantesPlaca(placaNorm)]
  const naFrota = variantes.some(v => frotaPlacas.has(v))
  if (!naFrota) return 'sem_rastreador'
  const pos = variantes.map(v => posicoes[v]).find(Boolean)
  if (!pos || !pos.datagps) return 'desatualizado'
  const dia = diaDoDatagps(pos.datagps)
  return dia === dataRef ? 'rastreado' : 'desatualizado'
}
