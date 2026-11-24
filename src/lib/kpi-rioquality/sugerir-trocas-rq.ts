// "Carro trocado?" na Rio Quality (24/11, pedido do Eric): a mesma sugestão
// da Nutry. Diferença: a RQ só busca o GPS das placas da escala, e o carro que
// fez o romaneio costuma estar fora dela (24/11: romaneio 1184782 do SRO9A31
// feito pelo KWQ6252, fora da escala). Então, quando algum romaneio ficou sem
// o carro da escala, busca o GPS do resto da frota antes de sugerir.
// Sempre só sugestão: quem confirma é a operação.
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import { normPlaca } from '@/lib/unitrac-api'
import { sugerirTrocas, cargasSemEscalado, type SugestaoTroca } from '@/lib/kpi-romaneio/sugerir-trocas'

type LinhaGeo = { carga: string; placa: string; endereco: string; lat: number | null; lng: number | null }

export type DepsSugestaoRQ = {
  /** placa normalizada -> cv da Unitrac. */
  frota: Map<string, string>
  buscarParadas: (cv: string, placaNorm: string, data: string) => Promise<UnitracParadaRow[]>
  /** false = dia fora das 48 h da Unitrac: fica só com o GPS da escala. */
  buscarForaDaEscala: boolean
  log?: (m: string) => void
}

const LOTE = 5

export async function sugerirTrocasRQ(data: string, romaneioGeo: LinhaGeo[], paradasEscala: Map<string, UnitracParadaRow[]>, deps: DepsSugestaoRQ): Promise<SugestaoTroca[]> {
  const pontos = romaneioGeo.filter(l => l.lat != null && l.lng != null)
    .map(l => ({ carga: l.carga, placa: normPlaca(l.placa), endereco: l.endereco, lat: l.lat as number, lng: l.lng as number }))
  if (cargasSemEscalado(pontos, paradasEscala).length === 0) return []
  const paradas = new Map(paradasEscala)
  if (deps.buscarForaDaEscala) {
    const faltam = [...deps.frota].filter(([p]) => !paradas.has(normPlaca(p)))
    let falhas = 0
    for (let i = 0; i < faltam.length; i += LOTE) {
      await Promise.all(faltam.slice(i, i + LOTE).map(async ([p, cv]) => {
        try { paradas.set(normPlaca(p), await deps.buscarParadas(cv, normPlaca(p), data)) } catch { falhas++ }
      }))
    }
    if (falhas > 0) deps.log?.(`carro trocado RQ ${data}: GPS de ${falhas} placa(s) fora da escala não lido`)
  }
  return sugerirTrocas(pontos, paradas, { frota: [...deps.frota.keys()].map(normPlaca) })
}
