export type ClassificacaoParada = 'BASE' | 'LOJA' | 'FORA_BASE' | 'FAKE_EXIT'

export type ParadaUnitrac = {
  placa_norm: string
  chegada: Date
  saida: Date
  /** Fim real dessa permanência (último evento GPS do cluster + duração dele) —
   *  diferente de `saida`, que é a CHEGADA do próximo cluster e por isso inclui
   *  o trajeto até lá. Ver consolida.ts. Opcional: só populado por dados vindos
   *  da API ao vivo (Nutry Max); produtores mais antigos (PDF do Benassi) não
   *  precisam saber dele — quem consome deve cair pra `saida` se ausente. */
  fimReal?: Date
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
