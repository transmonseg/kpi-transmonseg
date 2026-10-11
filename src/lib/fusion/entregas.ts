// src/lib/fusion/entregas.ts
import { fusionPost } from './client'
import type { RomaneioFusion, EntregaFusionRaw } from './tipos'

type Grid<T> = { total: number | string; rows: T[] }
const PARAMS = (data: string) => ({ data_inicial: data, data_final: data, romaneio_id: '', carga_erp_id: '', pedidos_faturados: '0' })

export async function buscarRomaneiosDoDia(data: string): Promise<RomaneioFusion[]> {
  const g = await fusionPost<Grid<RomaneioFusion>>('/php/dashboard/dashreentregas/get_grid_romaneios.php', PARAMS(data))
  return g.rows ?? []
}

export async function buscarEntregasDoRomaneio(romaneioId: string): Promise<EntregaFusionRaw[]> {
  const g = await fusionPost<Grid<EntregaFusionRaw>>('/php/dashboard/dashreentregas/get_grid_entregas_realizadas.php', { romaneio_id: romaneioId })
  return g.rows ?? []
}

export async function buscarEntregasDoDia(data: string) {
  const romaneios = await buscarRomaneiosDoDia(data)
  const entregas: EntregaFusionRaw[] = []
  for (const r of romaneios) entregas.push(...await buscarEntregasDoRomaneio(r.t10_id))
  return { romaneios, entregas }
}
