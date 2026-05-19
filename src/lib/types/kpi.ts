export type RotaStatus = 'pendente' | 'ok' | 'revisada' | 'sem_entrega'
export type AnomaliaStatus = 'pendente' | 'ignorada' | 'aceita' | 'corrigida' | 'sem_entrega'
export type AnomaliaSeveridade = 'HIGH' | 'MEDIUM' | 'LOW'

export type ParadaKpi = {
  parada_id: string | null
  loja_id: string | null
  nome: string
  chegada: Date
  saida: Date
  duracao_min: number
  classificacao: 'LOJA' | 'FORA_BASE'
}

export type MatchAlgorithm = 'exact' | 'alias' | 'trgm' | 'hybrid' | 'geo' | 'none'
export type MatchConfidence = 'HIGH' | 'LOW' | 'UNMATCHED'

export interface MatchMeta {
  score: number
  confidence: MatchConfidence
  requiresReview: boolean
  algorithm: MatchAlgorithm
}

export type RotaKpi = {
  escala_linha_id: string
  data: string
  rede_id: string
  placa_norm: string | null
  saida_cd: Date | null
  paradas: ParadaKpi[]
  anomalias_codigos: string[]
  status: RotaStatus
  _matchMeta?: MatchMeta
}

export type KpiLinha = {
  kpi_id: string
  escala_linha_id: string | null
  ordem: number
  loja_nome: string
  motorista: string | null
  placa: string | null
  carro_ordem: 1 | 2
  saida_cd: Date | null
  chd_loja_1: Date | null; saida_loja_1: Date | null; tempo_loja_1_min: number | null
  chd_loja_2: Date | null; saida_loja_2: Date | null; tempo_loja_2_min: number | null
  chd_loja_3: Date | null; saida_loja_3: Date | null; tempo_loja_3_min: number | null
  observacao: string | null
  anomalias_codigos: string[]
  kpi_rota_id?: string | null
  rota_status?: string | null
}

export type AnomaliaDetectada = {
  kpi_rota_id: string | null
  parada_id: string | null
  data: string
  codigo: string
  severidade: AnomaliaSeveridade
  descricao: string
  sugestao: string | null
  payload: Record<string, unknown>
}
