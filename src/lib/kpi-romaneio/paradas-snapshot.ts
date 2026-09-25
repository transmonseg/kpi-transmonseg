import { createServiceClient } from '@/lib/supabase/service'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'

// Chave de dedupe: chegada (a "data" da parada, ver comentario do brief da
// Task 7 -- UnitracParadaRow nao tem campo `_data`, esse e' o raw da Unitrac
// em StopApiCru; aqui o equivalente pos-consolidacao e' `chegada`) + lat/lng
// arredondado a 5 casas (~1m, absorve ruido de ponto flutuante entre duas
// capturas da mesma parada sem fundir paradas realmente diferentes).
function arred5(v: number | null): string {
  return v == null ? 'null' : v.toFixed(5)
}
const chaveParada = (p: UnitracParadaRow) => `${p.chegada}|${arred5(p.lat)}|${arred5(p.lng)}`

/** União deduplicada de duas listas de paradas da mesma placa, ordenada por chegada. */
export function mesclarParadas(a: UnitracParadaRow[], b: UnitracParadaRow[]): UnitracParadaRow[] {
  const mapa = new Map<string, UnitracParadaRow>()
  for (const p of a) mapa.set(chaveParada(p), p)
  for (const p of b) mapa.set(chaveParada(p), p)
  return [...mapa.values()].sort((x, y) => x.chegada.localeCompare(y.chegada))
}

/** Snapshot salvo (todas as placas) pra uma empresa+data. */
export async function lerSnapshotParadas(empresa: string, data: string): Promise<Map<string, UnitracParadaRow[]>> {
  const { data: linhas, error } = await createServiceClient()
    .from('kpi_paradas_snapshot').select('placa, paradas')
    .eq('empresa', empresa).eq('data', data)
  if (error) throw new Error(error.message)
  const mapa = new Map<string, UnitracParadaRow[]>()
  for (const l of (linhas ?? []) as Array<{ placa: string; paradas: UnitracParadaRow[] }>) {
    mapa.set(l.placa, l.paradas)
  }
  return mapa
}

/** Upsert por placa mesclando com o que já existe no snapshot -- nunca encolhe. */
export async function salvarSnapshotParadas(
  empresa: string,
  data: string,
  porPlaca: Map<string, UnitracParadaRow[]>,
): Promise<void> {
  if (porPlaca.size === 0) return
  const existente = await lerSnapshotParadas(empresa, data)
  const linhas = [...porPlaca].map(([placa, paradas]) => ({
    empresa,
    data,
    placa,
    paradas: mesclarParadas(existente.get(placa) ?? [], paradas),
    atualizado_em: new Date().toISOString(),
  }))
  const { error } = await createServiceClient().from('kpi_paradas_snapshot').upsert(linhas)
  if (error) throw new Error(error.message)
}

/** Paradas efetivas do dia por placa: hoje → grava a API no snapshot e devolve
 *  a API; dia passado → API mesclada com o snapshot (que pode ter mais
 *  paradas do que as 48h que a Unitrac ainda guarda). Falha de leitura/escrita
 *  do snapshot nunca quebra a geração -- loga e devolve a API crua. */
export async function paradasEfetivas(
  empresa: string,
  data: string,
  hoje: string,
  daApiPorPlaca: Map<string, UnitracParadaRow[]>,
): Promise<Map<string, UnitracParadaRow[]>> {
  try {
    if (data >= hoje) {
      await salvarSnapshotParadas(empresa, data, daApiPorPlaca)
      return daApiPorPlaca
    }
    const snap = await lerSnapshotParadas(empresa, data)
    const resultado = new Map<string, UnitracParadaRow[]>()
    for (const [placa, daApi] of daApiPorPlaca) {
      const doSnapshot = snap.get(placa)
      resultado.set(placa, doSnapshot && doSnapshot.length > 0 ? mesclarParadas(doSnapshot, daApi) : daApi)
    }
    return resultado
  } catch (err) {
    console.error('snapshot de paradas indisponível:', err)
    return daApiPorPlaca
  }
}
