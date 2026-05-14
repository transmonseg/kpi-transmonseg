export type LinhaEscala = {
  data: string            // YYYY-MM-DD (data da aba/bloco)
  data_entrega: string    // YYYY-MM-DD (pode ser D+1 para ZS)
  rede_id: string         // 'ASSAI', 'ZONA_SUL', 'SUPER_PAX', etc.
  loja_nome_raw: string   // texto exato como veio do arquivo
  loja_codigo_raw: string | null  // número (escala geral) ou alias (ZS filial)
  placa_norm: string      // normalizada sem hífen
  placa_raw: string | null
  motorista_nome: string | null
  motorista_codigo: string | null
  tipo_carro: string | null
  carro_ordem: 1 | 2
  turno: 'MANHA' | 'TARDE'
  tipo_emissao: 'NORMAL' | 'BENASSI' | 'FORA_ESCALA'
  obs: string | null      // "SEM PEDIDO", "2ª ENTREGA ATÉ 7H", etc.
  restricao: string | null  // "MAXIMO TOCO", "SOMENTE KIA OU VUC", etc.
  peso_kg: number | null
  paletes: number | null
  raw_row_num: number | null
}

export type Carro = {
  tipo: string | null
  motorista: string | null
  cod: string | null
  placa_norm: string
  placa_raw: string | null
}
