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

export type MatchAlgorithm = 'exact' | 'alias' | 'trgm' | 'hybrid' | 'geo' | 'crossdock' | 'troca' | 'none'
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
  /** Placa que REALMENTE entregou, quando difere da escalada (troca de carro). */
  placa_real?: string | null
  /** Match por geo caiu DENTRO do raio cadastrado (nosso limite de metros) →
   * alta confiança, entra no KPI do cliente sem precisar de revisão. */
  geo_confiavel?: boolean
  /** Distância em metros entre o GPS e a loja esperada, quando a entrega casou por
   * geo (expansão em degraus de 50m até 500m). Exibida no preview pra operação ver
   * quão perto bateu. Null quando não casou por geo. */
  geo_dist_metros?: number | null
  /** Placa REALMENTE usada no Unitrac (resolvida via Mercosul/OCR a partir da escala).
   * Usada internamente para buscar as paradas — a placa antiga da escala não acha as
   * paradas registradas no padrão Mercosul. Não exibida (display usa placa_norm). */
  placa_unitrac?: string | null
  saida_cd: Date | null
  /** Horário em que a placa VOLTOU pra base depois das entregas: chegada da
   * primeira parada de BASE após a parada de entrega. Null quando o caminhão não
   * registrou retorno à base no relatório (ex: terminou o dia fora). */
  chegada_base?: Date | null
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
  /** Horário de retorno à base depois das entregas (volta pra base). */
  chegada_base?: Date | null
  chd_loja_1: Date | null; saida_loja_1: Date | null; tempo_loja_1_min: number | null
  chd_loja_2: Date | null; saida_loja_2: Date | null; tempo_loja_2_min: number | null
  chd_loja_3: Date | null; saida_loja_3: Date | null; tempo_loja_3_min: number | null
  observacao: string | null
  anomalias_codigos: string[]
  kpi_rota_id?: string | null
  rota_status?: string | null
  kpi_linha_id?: string | null
  /** A placa aparece no relatório Unitrac (tem rastreador). Define a legenda do KPI. */
  placa_rastreada?: boolean
  /** A placa foi a alguma LOJA (entregou em outro lugar) — usada para "mudou de rota". */
  placa_foi_algum_lugar?: boolean
  /** A placa saiu da base (tem parada LOJA ou FORA_BASE). Se está no relatório mas
   * isto é false → "NÃO SAIU DA BASE" (caminhão ficou no CD). */
  placa_saiu_da_base?: boolean
  /** O relatório foi cortado com o caminhão AINDA em rota: saiu da base e a chegada
   * caiu depois do horizonte do relatório. O KPI mostra a saída de base (fato) e
   * marca "RELATÓRIO PARCIAL", em vez de "não foi ao cliente". Caso KOP-4978 09/06. */
  relatorio_parcial?: boolean
  /** Saída de base atribuída ao caso parcial — o fato a exibir na coluna SAÍDA CD. */
  saida_base_parcial?: Date | null
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
