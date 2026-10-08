// Veredito de UMA nota, comparando o KPI com o GPS do monitoramento (fonte
// independente da Unitrac). Usado por scripts/auditar-dia.ts (08/10).
export type EntradaAuditoria = {
  status: 'entregue' | 'pendente'
  /** Rota de hoje ainda sem voltar à base. */
  emRota: boolean
  /** Menor distância (m) de qualquer posição do GPS ao endereço no dia; null = sem GPS. */
  gpsMinM: number | null
  /** Minutos parado (<= 3 km/h) a <= 150 m do endereço, somando o dia. */
  gpsParadoMin: number
  /** Chegada que o KPI mostra, em minutos desde 00:00 (null = sem horário). */
  kpiChegadaMin: number | null
  /** Início de cada parada do GPS no endereço (geocode ou cadastro), em minutos desde 00:00. */
  gpsParadoInisMin: number[]
}
export type Veredito = 'OK' | 'HORARIO_DIVERGE' | 'SUSPEITA_FALSO_POSITIVO' | 'SEM_GPS'
  | 'SUSPEITA_FALSO_NEGATIVO' | 'EM_ROTA' | 'NAO_ENTREGUE_OK'

const PARADO_MIN = 2
const PERTO_M = 300
const HORARIO_TOLERANCIA_MIN = 45

export function classificarNf(e: EntradaAuditoria): Veredito {
  if (e.status === 'pendente') {
    if (e.gpsParadoMin >= 3) return 'SUSPEITA_FALSO_NEGATIVO'
    return e.emRota ? 'EM_ROTA' : 'NAO_ENTREGUE_OK'
  }
  if (e.gpsMinM == null) return 'SEM_GPS'
  if (e.gpsParadoMin >= PARADO_MIN) {
    const k = e.kpiChegadaMin
    const diverge = k != null && e.gpsParadoInisMin.length > 0 && e.gpsParadoInisMin.every(i => Math.abs(k - i) > HORARIO_TOLERANCIA_MIN)
    return diverge ? 'HORARIO_DIVERGE' : 'OK'
  }
  return e.gpsMinM > PERTO_M ? 'SUSPEITA_FALSO_POSITIVO' : 'OK'
}
