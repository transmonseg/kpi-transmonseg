import type { LinhaEscalaNutrimax, LinhaRomaneioNutrimax, RelatorioPlacaNutrimax } from './types'

function contaClientesDistintos(linhas: LinhaRomaneioNutrimax[]): number {
  return new Set(linhas.map(l => l.clienteCodigo || l.clienteNome)).size
}

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
    const entRecebido = contaClientesDistintos(linhas)

    let status: RelatorioPlacaNutrimax['status'] = 'ok'
    if (nfRecebido === 0) {
      status = 'ausente'
    } else {
      const placaRomaneio = linhas[0].placa
      const placaDivergente = !!e.placaNorm && !!placaRomaneio && e.placaNorm !== placaRomaneio
      const nfIncompleto = e.nfPlanejado != null && nfRecebido < e.nfPlanejado
      const entIncompleto = e.entPlanejado != null && entRecebido < e.entPlanejado
      if (placaDivergente || nfIncompleto || entIncompleto) status = 'divergente'
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
      entPlanejado: e.entPlanejado,
      entRecebido,
      status,
      clientes: linhas.map(l => ({ nf: l.nf, clienteNome: l.clienteNome, endereco: l.endereco })),
    }
  })
}
