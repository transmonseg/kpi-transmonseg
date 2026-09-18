import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import type { LinhaDetalheEntrega } from '../types'

export type LinhaDump = {
  nf: string
  carga: string
  placa: string
  clienteNome: string
  endereco: string
  lat: number | null
  lng: number | null
  geoConfiavel: boolean
  geoMotivo: string | null
  status: LinhaDetalheEntrega['status']
  observacao: string | null
}

export type DumpExperimento = {
  data: string
  linhas: LinhaDump[]
  paradasPorPlaca: Record<string, UnitracParadaRow[]>
}
