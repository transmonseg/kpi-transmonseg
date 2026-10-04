import { haversine } from '@/lib/utils/geo'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'

// Aviso de troca de placa (04/10/2026, caso real 03/10: RBG4F53 fez a carga
// de Araruama e RQV5F67 a de Macae, a escala dizia o contrario). So' INFORMA
// qual placa provavelmente fez a carga -- nunca confirma NF por outra placa
// (regra do usuario). A operacao corrige a escala e regera.
const RAIO_M = 300
const DURACAO_MIN_MIN = 2
const MIN_NFS = 3
const FRACAO_MIN = 0.5

export type TrocaProvavel = { outraPlaca: string; nfsPerto: number; nfsComCoord: number }

function duracaoMin(p: UnitracParadaRow): number {
  return (new Date(p.fim_real ?? p.saida ?? p.chegada).getTime() - new Date(p.chegada).getTime()) / 60_000
}

/** Pra cada carga+placa (chave `carga::placa`) da lista, a OUTRA placa que
 *  parou (>=2 min, <=300 m) perto do maior numero de clientes da carga --
 *  só quando cobre ao menos metade das NFs com coordenada (e >=3). */
export function detectarTrocasProvaveis(
  cargas: Map<string, { lat: number | null; lng: number | null }[]>,
  chavesDivergentes: Set<string>,
  paradasPorPlaca: Map<string, UnitracParadaRow[]>,
): Map<string, TrocaProvavel> {
  const out = new Map<string, TrocaProvavel>()
  for (const chave of chavesDivergentes) {
    const [, placaEscala] = chave.split('::')
    const pontos = (cargas.get(chave) ?? []).filter((l): l is { lat: number; lng: number } => l.lat != null && l.lng != null)
    if (pontos.length < MIN_NFS) continue
    let melhor: TrocaProvavel | null = null
    for (const [placa, paradas] of paradasPorPlaca) {
      if (placa === placaEscala) continue
      const fb = paradas.filter(p => p.classificacao === 'FORA_BASE' && p.lat != null && p.lng != null && duracaoMin(p) >= DURACAO_MIN_MIN)
      if (!fb.length) continue
      const perto = pontos.filter(l => fb.some(p => haversine(l.lat, l.lng, p.lat as number, p.lng as number) <= RAIO_M)).length
      if (!melhor || perto > melhor.nfsPerto) melhor = { outraPlaca: placa, nfsPerto: perto, nfsComCoord: pontos.length }
    }
    if (melhor && melhor.nfsPerto >= MIN_NFS && melhor.nfsPerto / pontos.length >= FRACAO_MIN) out.set(chave, melhor)
  }
  return out
}
