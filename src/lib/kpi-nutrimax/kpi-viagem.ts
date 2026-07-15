import type { LinhaEscalaNutrimax, ResumoViagemPlacaNutrimax, KpiViagemNutrimax } from './types'

export function montaKpiViagemPorCarga(
  escala: LinhaEscalaNutrimax[],
  resumoViagem: ResumoViagemPlacaNutrimax[],
): KpiViagemNutrimax[] {
  const porPlaca = new Map(resumoViagem.map(r => [r.placaNorm, r]))

  return escala.map((e): KpiViagemNutrimax => {
    const r = porPlaca.get(e.placaNorm)
    const qtdParadasReal = r?.qtdParadas ?? 0

    let status: KpiViagemNutrimax['status'] = 'ok'
    if (!r) {
      status = 'sem_rastreador'
    } else if (e.entPlanejado != null && qtdParadasReal < e.entPlanejado) {
      status = 'incompleto'
    }

    return {
      carga: e.carga,
      placaRaw: e.placaRaw,
      placaNorm: e.placaNorm,
      destino: e.destino,
      motorista: e.motorista,
      ajudante1: e.ajudante1,
      ajudante2: e.ajudante2,
      pesoKg: e.pesoKg,
      entPlanejado: e.entPlanejado,
      nfPlanejado: e.nfPlanejado,
      qtdParadasReal,
      kmPercorrido: r?.kmPercorrido ?? null,
      inicioViagem: r?.inicioViagem ?? null,
      fimViagem: r?.fimViagem ?? null,
      status,
    }
  })
}
