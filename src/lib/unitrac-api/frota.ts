import { apiGet, COD_USER } from './client'

export type VeiculoApi = { cv: string; placa: string; placaNorm: string }

export function normPlaca(p: string): string {
  return p.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export async function buscarFrota(codUser: string = COD_USER): Promise<VeiculoApi[]> {
  const d = (await apiGet(`/veiculos/masn/${codUser}`)) as { veiculos?: Array<{ cv: number; placa: string }> } | null
  if (!d?.veiculos) return []
  return d.veiculos.map(v => ({ cv: String(v.cv), placa: v.placa, placaNorm: normPlaca(v.placa) }))
}
