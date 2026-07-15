import type { ResumoVeiculo } from '@/lib/types/unitrac'
import type { ResumoViagemPlacaNutrimax } from './types'

export function montaResumoViagemPorPlaca(resumos: ResumoVeiculo[]): ResumoViagemPlacaNutrimax[] {
  return resumos.map((r): ResumoViagemPlacaNutrimax => {
    const temDistancia = r.paradas.some(p => p.distancia_km != null)
    const km = r.paradas.reduce((acc, p) => acc + (p.distancia_km ?? 0), 0)
    return {
      placaNorm: r.placa_norm,
      kmPercorrido: temDistancia ? Math.round(km * 10) / 10 : null,
      qtdParadas: r.qtd_paradas,
      inicioViagem: r.inicio_viagem ? r.inicio_viagem.toISOString() : null,
      fimViagem: r.fim_viagem ? r.fim_viagem.toISOString() : null,
    }
  })
}
