// src/lib/parsers/alteracoes-v2.types.ts

export interface Associacao {
  motorista_nome: string
  motorista_nome_norm: string  // normalizado: upper + sem acentos + sem espaços extras
  motorista_codigo: number | null
  placa_norm: string | null
  placa_raw: string | null
  data_entrega: string  // YYYY-MM-DD, usado pra ordenar (mais recente primeiro)
  rede_id: string | null
}

export interface ParseContext {
  associacoes: Associacao[]
  lojas: Array<{
    rede_id: string
    nome: string
    nome_norm: string
    codigo_escala: string | null
  }>
}

export type FonteCampo = 'mensagem' | 'banco' | 'inferido' | null

export interface SlotVeiculo {
  motorista_nome: string | null
  motorista_codigo: number | null
  placa_raw: string | null
  placa_norm: string | null
  fonte_nome: FonteCampo
  fonte_codigo: FonteCampo
  fonte_placa: FonteCampo
}

export interface AlteracaoBloco {
  rede_id: string | null
  loja_nome_raw: string | null
  filial: number | null
  sai: SlotVeiculo | null
  entra: SlotVeiculo | null
  motivo: string | null
  confianca: 'alta' | 'media' | 'baixa'
  warnings: string[]
  raw: string
}
