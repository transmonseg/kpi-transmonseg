import { haversine } from '@/lib/utils/geo'
import type { UnitracParadaRow } from './matcher'

const RAIO_DUP_M = 200
const JANELA_DUP_MIN = 20

/**
 * Mescla paradas do PDF (base, autoritativa) com as da API (ao vivo), adicionando
 * SÓ as paradas da API que o PDF ainda NÃO tem — pra preencher o que um relatório
 * gerado cedo perdeu (ex: entregas da tarde). Uma parada da API é "duplicata" de
 * uma do PDF quando, pra MESMA placa, está a ≤200m e ≤20min — nesse caso o PDF
 * manda e a da API é descartada. Parada da API sem coordenada é mantida (não dá
 * pra deduplicar com segurança). O matcher + anti-dupla cuidam do resto.
 */
export function mesclarParadas(pdf: UnitracParadaRow[], api: UnitracParadaRow[]): UnitracParadaRow[] {
  const novas = api.filter(a => {
    if (a.lat == null || a.lng == null) return true
    const dup = pdf.some(p =>
      p.placa_norm === a.placa_norm && p.lat != null && p.lng != null &&
      haversine(p.lat, p.lng, a.lat!, a.lng!) <= RAIO_DUP_M &&
      Math.abs(new Date(p.chegada).getTime() - new Date(a.chegada).getTime()) <= JANELA_DUP_MIN * 60_000)
    return !dup
  })
  return [...pdf, ...novas]
}
