import { apiGet } from './client'

export type ParadaApi = { inicioISO: string; duracaoSeg: number; lat: number; lon: number }

export async function buscarParadas(cv: string, horas: number): Promise<ParadaApi[]> {
  const d = (await apiGet(`/mapa_servicos/stops/${cv}/${horas}`)) as {
    paradas?: Array<{ _data: string; tempoparada: number; latitude: number; longitude: number }>
  } | null
  return (d?.paradas ?? [])
    .filter(p => p.tempoparada >= 120)
    .map(p => ({ inicioISO: p._data, duracaoSeg: p.tempoparada, lat: p.latitude, lon: p.longitude }))
}
