export type SegmentoAlteracao = {
  nome: string | null
  cod: string | null
  placa: string | null
}

export type AlteracaoParsed = {
  tipo: 'SUBSTITUICAO' | 'INCLUSAO' | 'COMUNICADO' | 'INFORMATIVO' | 'BAIXA'
  redeRaw: string | null
  lojaRaw: string | null
  filial: number | null
  entra: SegmentoAlteracao | null
  sai: SegmentoAlteracao | null
  motivo: string | null
  confianca: 'alta' | 'media' | 'baixa'
  raw: string
}
