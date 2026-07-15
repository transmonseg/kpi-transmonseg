/** Uma linha do Romaneio de Entrega — um cliente dentro de uma carga/placa. */
export type LinhaRomaneioNutrimax = {
  carga: string
  destino: string
  placa: string
  motorista: string
  ajudantes: string[]
  nf: string
  clienteCodigo: string
  clienteNome: string
  endereco: string
}

/** Uma linha da Escala de Rota — o planejado (qual placa vai pra qual destino, quantos NFs). */
export type LinhaEscalaNutrimax = {
  carga: string
  placaRaw: string
  placaNorm: string
  destino: string
  motorista: string
  ajudante1: string | null
  ajudante2: string | null
  pesoKg: number | null
  entPlanejado: number | null
  nfPlanejado: number | null
}

/** Aviso de cobertura ao cruzar a Escala (planejado) com o Romaneio (executado). */
export type AvisoCoberturaNutrimax =
  | { tipo: 'carga_ausente'; carga: string; destino: string; placa: string }
  | { tipo: 'placa_divergente'; carga: string; placaEscala: string; placaRomaneio: string }
  | { tipo: 'entregas_incompletas'; carga: string; planejado: number; recebido: number }

/** Uma linha pronta pra persistir em kpi_nutrimax_entradas — já cruzada com o Unitrac. */
export type EntradaNutrimax = {
  data: string // YYYY-MM-DD
  carga: string
  destino: string
  placa: string
  motorista: string | null
  nf: string
  cliente_codigo: string | null
  cliente_nome: string
  endereco: string | null
  status: 'entregue' | 'pendente'
  hora_realizado: string | null // ISO, null quando pendente
}

/** Um cliente dentro da aba de uma placa, no relatório de conferência. */
export type ClienteRomaneioResumo = {
  nf: string
  clienteNome: string
  endereco: string | null
}

/** Uma linha do relatório "Romaneio Nutry" — uma carga/placa da escala, com o resultado
 *  da conferência contra o romaneio e os clientes encontrados. */
export type RelatorioPlacaNutrimax = {
  carga: string
  placaRaw: string
  placaNorm: string
  destino: string
  motorista: string
  ajudante1: string | null
  ajudante2: string | null
  pesoKg: number | null
  nfPlanejado: number | null
  nfRecebido: number
  /** Clientes distintos planejados (ENT da escala) — diferente de NF: um cliente
   *  pode receber mais de uma nota fiscal na mesma carga. */
  entPlanejado: number | null
  /** Clientes distintos que de fato apareceram no romaneio pra essa carga. */
  entRecebido: number
  status: 'ok' | 'divergente' | 'ausente'
  clientes: ClienteRomaneioResumo[]
}
