export type LinhaRomaneioPortefrio = {
  placa: string
  codigoCliente: string
  cnpj: string
  razaoSocial: string
  nomeInformal: string
  endereco: string // rua/avenida (coluna Endereço, sem número/bairro/cidade)
  numero: string
  cep: string
  bairro: string
  cidade: string
  uf: string
  ordem: number
}
