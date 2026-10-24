// src/lib/fusion/entregas.ts
import { fusionPost } from './client'
import type { RomaneioFusion, EntregaFusionRaw } from './tipos'

type Grid<T> = { total: number | string; rows: T[] }
// Revisao Fase 2 (F2-REV-02): JSON 200 sem `rows` virava romaneio vazio
// (`g.rows ?? []`) e o romaneio sumia do dia em silencio. Agora e' erro.
function linhasDaGrade<T>(g: Grid<T> | null | undefined, path: string): T[] {
  if (!g || !Array.isArray(g.rows)) throw new Error(`Fusion: resposta sem rows em ${path}`)
  return g.rows
}

const PARAMS = (data: string) => ({ data_inicial: data, data_final: data, romaneio_id: '', carga_erp_id: '', pedidos_faturados: '0' })

export async function buscarRomaneiosDoDia(data: string): Promise<RomaneioFusion[]> {
  const path = '/php/dashboard/dashreentregas/get_grid_romaneios.php'
  return linhasDaGrade(await fusionPost<Grid<RomaneioFusion>>(path, PARAMS(data)), path)
}

export async function buscarEntregasDoRomaneio(romaneioId: string): Promise<EntregaFusionRaw[]> {
  const path = '/php/dashboard/dashreentregas/get_grid_entregas_realizadas.php'
  return linhasDaGrade(await fusionPost<Grid<EntregaFusionRaw>>(path, { romaneio_id: romaneioId }), `${path} (romaneio ${romaneioId})`)
}

export async function buscarEntregasDoDia(data: string) {
  const romaneios = await buscarRomaneiosDoDia(data)
  const entregas: EntregaFusionRaw[] = []
  for (const r of romaneios) entregas.push(...await buscarEntregasDoRomaneio(r.t10_id))
  return { romaneios, entregas }
}
