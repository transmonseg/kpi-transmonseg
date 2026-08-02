export type LinhaManual = {
  rede_id: string
  loja: string
  placa: string | null
  motorista: string | null
  status: string
  saida_cd: string | null
  chd: string | null
  sai: string | null
  volta_base: string | null
}

export type RedeManual = {
  rede_id: string
  rede_nome: string
  linhas: LinhaManual[]
}
