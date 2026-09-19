import { createServiceClient } from '@/lib/supabase/service'
import type { AlvoApi } from '@/lib/unitrac-api'

const chave = (a: AlvoApi) => `${a.placaNorm}|${a.codigoUnitrac}|${a.documento ?? ''}|${a.ordem}`

export function mesclarAlvos(antigos: AlvoApi[], novos: AlvoApi[]): AlvoApi[] {
  const mapa = new Map<string, AlvoApi>()
  for (const a of antigos) mapa.set(chave(a), a)
  for (const a of novos) {
    const atual = mapa.get(chave(a))
    if (atual && atual.situacao === 1 && a.situacao !== 1) continue
    mapa.set(chave(a), a)
  }
  return [...mapa.values()]
}

export async function lerSnapshotAlvos(cliente: string, data: string): Promise<AlvoApi[] | null> {
  const { data: row, error } = await createServiceClient()
    .from('kpi_alvos_snapshot').select('alvos')
    .eq('cliente', cliente).eq('data_referencia', data).maybeSingle()
  if (error) throw new Error(error.message)
  return row ? (row.alvos as AlvoApi[]) : null
}

export async function salvarSnapshotAlvos(cliente: string, data: string, alvos: AlvoApi[]): Promise<void> {
  const existente = await lerSnapshotAlvos(cliente, data)
  const final = mesclarAlvos(existente ?? [], alvos)
  const { error } = await createServiceClient().from('kpi_alvos_snapshot').upsert({
    cliente, data_referencia: data, capturado_em: new Date().toISOString(),
    qtd_alvos: final.length, alvos: final,
  })
  if (error) throw new Error(error.message)
}

/** Alvos efetivos do dia: hoje → grava a API no snapshot; dia passado → API mesclada com o snapshot. */
export async function alvosEfetivos(cliente: string, data: string, hoje: string, daApi: AlvoApi[]): Promise<AlvoApi[]> {
  try {
    if (data >= hoje) {
      if (daApi.length > 0) await salvarSnapshotAlvos(cliente, data, daApi)
      return daApi
    }
    return mesclarAlvos((await lerSnapshotAlvos(cliente, data)) ?? [], daApi)
  } catch (err) {
    console.error('snapshot de alvos indisponível:', err)
    return daApi
  }
}
