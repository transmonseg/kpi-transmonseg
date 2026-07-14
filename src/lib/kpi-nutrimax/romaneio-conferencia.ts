import type { LinhaEscalaNutrimax, LinhaRomaneioNutrimax, RelatorioPlacaNutrimax } from './types'

export function montaRelatorioPorPlaca(
  escala: LinhaEscalaNutrimax[],
  romaneio: LinhaRomaneioNutrimax[],
): RelatorioPlacaNutrimax[] {
  const porCarga = new Map<string, LinhaRomaneioNutrimax[]>()
  for (const l of romaneio) {
    const arr = porCarga.get(l.carga) ?? []
    arr.push(l)
    porCarga.set(l.carga, arr)
  }

  return escala.map((e): RelatorioPlacaNutrimax => {
    const linhas = porCarga.get(e.carga) ?? []
    const nfRecebido = linhas.length

    let status: RelatorioPlacaNutrimax['status'] = 'ok'
    if (nfRecebido === 0) {
      status = 'ausente'
    } else {
      const placaRomaneio = linhas[0].placa
      const placaDivergente = !!e.placaNorm && !!placaRomaneio && e.placaNorm !== placaRomaneio
      const entregasIncompletas = e.nfPlanejado != null && nfRecebido < e.nfPlanejado
      if (placaDivergente || entregasIncompletas) status = 'divergente'
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
      nfPlanejado: e.nfPlanejado,
      nfRecebido,
      status,
      clientes: linhas.map(l => ({ nf: l.nf, clienteNome: l.clienteNome, endereco: l.endereco })),
    }
  })
}
