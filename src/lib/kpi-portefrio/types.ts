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

export type EventoRavex = {
  dataHora: string // ISO
  lat: number
  lng: number
  temperatura: number | null
}

export type LinhaGeocodificada = LinhaRomaneioPortefrio & {
  lat: number | null
  lng: number | null
}

export type Visita = {
  codigoCliente: string
  chegada: string // ISO, dataHora do primeiro evento do cluster
  saida: string // ISO, dataHora do ultimo evento do cluster
  distanciaMetrosDoPonto: number
  temperaturas: number[] // todas as leituras nao-null dentro do cluster
}
