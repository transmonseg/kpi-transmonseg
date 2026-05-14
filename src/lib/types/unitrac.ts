export type ClassificacaoParada = 'BASE' | 'LOJA' | 'FORA_BASE' | 'FAKE_EXIT'

export type ParadaUnitrac = {
  placa_norm: string
  chegada: Date
  saida: Date
  duracao_seg: number
  distancia_km: number | null
  endereco: string | null
  lat: number | null
  lng: number | null
  local_parada: string
  codigo_loja: string | null     // extraído de "{CODIGO} - {NOME}"
  nome_loja: string | null
  classificacao: ClassificacaoParada
  ordem: number
}

export type ResumoVeiculo = {
  placa_norm: string
  placa_raw: string
  inicio_viagem: Date | null
  fim_viagem: Date | null
  qtd_paradas: number
  paradas: ParadaUnitrac[]
  saida_cd: Date | null          // última saída de BASE antes da 1ª LOJA
}
