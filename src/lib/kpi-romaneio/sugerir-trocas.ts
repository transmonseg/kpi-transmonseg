// Carro trocado sem aviso (06/10: PAO-2/3/5 e Petrópolis 3 rodados por carros
// fora da escala enquanto o escalado ficou na base/oficina -- achados na mão
// pelo GPS). Sugere a troca pra operação confirmar no Ao vivo: nunca aplica
// sozinho.
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import { haversine } from '@/lib/utils/geo'

export type SugestaoTroca = {
  carga: string
  placaEscala: string
  placaSugerida: string
  enderecosVisitados: number
  enderecosDaCarga: number
}

type PontoCarga = { carga: string; placa: string; endereco: string; lat: number; lng: number }

const RAIO_ENDERECO_M = 400 // 250 perdia PAO-5 06/10 (RQM4C16 a 260-400 m de 3 dos 5)
const MIN_ENDERECOS = 2
const FRACAO_MIN = 0.5
const FRACAO_MAX_ESCALADO = 0.2
// Carro com carga propria so' e' candidato se ela e' pequena perto da carga que
// teria rodado (08/10: RQV5F67 com 1 NF rodou as 21 do UNN6G81, mesmo motorista).
const MAX_ENDERECOS_PROPRIOS_ABS = 2
const FRACAO_MAX_PROPRIA = 0.25

const paradasForaDaBase = (ps: UnitracParadaRow[]) =>
  ps.filter((p): p is UnitracParadaRow & { lat: number; lng: number } => p.classificacao === 'FORA_BASE' && p.lat != null && p.lng != null)

/** Para cada carga em que o carro da escala passou em no máximo 20% dos
 *  endereços, procura entre os carros SEM carga no dia (ou com carga própria bem
 *  pequena) o que parou em mais endereços da carga (<= RAIO_ENDERECO_M). Sugere só com >= MIN_ENDERECOS e >= metade
 *  dos endereços, e quando o 2º colocado não empata. */
export function sugerirTrocas(pontos: PontoCarga[], paradasPorPlaca: Map<string, UnitracParadaRow[]>): SugestaoTroca[] {
  const placasComCarga = new Set(pontos.map(p => p.placa))
  const livres = [...paradasPorPlaca.keys()].filter(p => !placasComCarga.has(p))
  const enderecosProprios = new Map<string, Set<string>>()
  for (const p of pontos) enderecosProprios.set(p.placa, (enderecosProprios.get(p.placa) ?? new Set()).add(p.endereco))
  const porCarga = new Map<string, PontoCarga[]>()
  for (const p of pontos) porCarga.set(p.carga, [...(porCarga.get(p.carga) ?? []), p])

  const out: SugestaoTroca[] = []
  for (const [carga, ps] of porCarga) {
    const placaEscala = ps[0].placa
    if (!placaEscala) continue
    const enderecos = new Map<string, { lat: number; lng: number }>()
    for (const p of ps) if (!enderecos.has(p.endereco)) enderecos.set(p.endereco, { lat: p.lat, lng: p.lng })
    const total = enderecos.size
    if (total < MIN_ENDERECOS) continue
    const visitou = (placa: string) => {
      const paradas = paradasForaDaBase(paradasPorPlaca.get(placa) ?? [])
      return [...enderecos.values()].filter(e => paradas.some(s => haversine(e.lat, e.lng, s.lat, s.lng) <= RAIO_ENDERECO_M)).length
    }
    // Escalado praticamente nao passou na carga (06/10, TTI6E49: andou 300 m
    // ate' a rua da base -- "sem parada fora da base" nao pegava).
    const doEscalado = visitou(placaEscala)
    if (doEscalado > FRACAO_MAX_ESCALADO * total) continue
    const candidatas = [
      ...livres,
      ...[...enderecosProprios].filter(([placa, e]) => placa && placa !== placaEscala && paradasPorPlaca.has(placa)
        && e.size <= Math.max(MAX_ENDERECOS_PROPRIOS_ABS, FRACAO_MAX_PROPRIA * total)).map(([placa]) => placa),
    ]
    const ranking = candidatas.map(placa => ({ placa, visitados: visitou(placa) })).sort((a, b) => b.visitados - a.visitados)
    const [melhor, segundo] = ranking
    if (!melhor || melhor.visitados < MIN_ENDERECOS || melhor.visitados < FRACAO_MIN * total) continue
    if (melhor.visitados < doEscalado + MIN_ENDERECOS) continue
    if (segundo && segundo.visitados === melhor.visitados) continue
    out.push({ carga, placaEscala, placaSugerida: melhor.placa, enderecosVisitados: melhor.visitados, enderecosDaCarga: total })
  }
  return out
}
