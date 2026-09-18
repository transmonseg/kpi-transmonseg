import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import type { LinhaDetalheEntrega, LinhaGeocodificada } from '../types'
import type { DumpExperimento, LinhaDump } from './tipos'

/** Foto do dia depois do pipeline: uma linha por NF (coordenada + veredito) e as
 *  paradas de cada placa do romaneio. E' a entrada das analises offline de
 *  `experimentos/` -- nao muda nada do relatorio. */
export function montarDumpExperimento(params: {
  data: string
  romaneioGeo: LinhaGeocodificada[]
  detalhe: LinhaDetalheEntrega[]
  paradasPorPlaca: Map<string, UnitracParadaRow[]>
}): DumpExperimento {
  const detalhePorChave = new Map(params.detalhe.map(d => [`${d.carga}::${d.nf}`, d]))
  const linhas: LinhaDump[] = []
  for (const l of params.romaneioGeo) {
    const d = detalhePorChave.get(`${l.carga}::${l.nf}`)
    if (!d) continue
    linhas.push({
      nf: l.nf,
      carga: l.carga,
      placa: d.placa,
      clienteNome: l.clienteNome,
      endereco: l.endereco,
      lat: l.lat,
      lng: l.lng,
      geoConfiavel: l.geoConfiavel !== false,
      geoMotivo: l.geoMotivo ?? null,
      status: d.status,
      observacao: d.observacao,
    })
  }
  const paradasPorPlaca: Record<string, UnitracParadaRow[]> = {}
  for (const placa of new Set(linhas.map(l => l.placa))) {
    paradasPorPlaca[placa] = params.paradasPorPlaca.get(placa) ?? []
  }
  return { data: params.data, linhas, paradasPorPlaca }
}
