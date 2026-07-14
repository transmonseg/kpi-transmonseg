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
