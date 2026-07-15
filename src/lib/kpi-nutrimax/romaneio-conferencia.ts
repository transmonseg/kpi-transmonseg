import type { ParadaUnitrac, ResumoVeiculo } from '@/lib/types/unitrac'
import type {
  LinhaEscalaNutrimax,
  LinhaRomaneioNutrimax,
  RelatorioPlacaNutrimax,
  ClienteConferidoNutrimax,
  ParadaConferidaNutrimax,
} from './types'

function contaClientesDistintos(linhas: LinhaRomaneioNutrimax[]): number {
  return new Set(linhas.map(l => l.clienteCodigo || l.clienteNome)).size
}

function toParadaConferida(p: ParadaUnitrac): ParadaConferidaNutrimax {
  return {
    chegada: p.chegada.toISOString(),
    saida: p.saida.toISOString(),
    distanciaKm: p.distancia_km,
    localParada: p.local_parada,
    codigoLoja: p.codigo_loja,
    nomeLoja: p.nome_loja,
  }
}

export function montaRelatorioPorPlaca(
  escala: LinhaEscalaNutrimax[],
  romaneio: LinhaRomaneioNutrimax[],
  resumosVeiculo: ResumoVeiculo[],
): RelatorioPlacaNutrimax[] {
  const porCarga = new Map<string, LinhaRomaneioNutrimax[]>()
  for (const l of romaneio) {
    const arr = porCarga.get(l.carga) ?? []
    arr.push(l)
    porCarga.set(l.carga, arr)
  }
  const veiculoPorPlaca = new Map(resumosVeiculo.map(v => [v.placa_norm, v]))

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

    const veiculo = veiculoPorPlaca.get(e.placaNorm) ?? null

    const paradasLoja = (veiculo?.paradas ?? [])
      .filter((p): p is ParadaUnitrac & { codigo_loja: string } => p.classificacao === 'LOJA' && p.codigo_loja !== null)
      .sort((a, b) => a.ordem - b.ordem)
    const paradaPorCodigo = new Map<string, ParadaUnitrac & { codigo_loja: string }>()
    for (const p of paradasLoja) {
      if (!paradaPorCodigo.has(p.codigo_loja)) paradaPorCodigo.set(p.codigo_loja, p)
    }

    const usados = new Set<string>()
    const clientes: ClienteConferidoNutrimax[] = linhas.map(l => {
      const parada = l.clienteCodigo ? paradaPorCodigo.get(l.clienteCodigo) : undefined
      if (parada) usados.add(parada.codigo_loja)
      return {
        nf: l.nf,
        clienteNome: l.clienteNome,
        endereco: l.endereco,
        parada: parada ? toParadaConferida(parada) : null,
      }
    })
    const paradasSemCliente = paradasLoja.filter(p => !usados.has(p.codigo_loja)).map(toParadaConferida)

    const temDistancia = (veiculo?.paradas ?? []).some(p => p.distancia_km != null)
    const km = (veiculo?.paradas ?? []).reduce((acc, p) => acc + (p.distancia_km ?? 0), 0)

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
      clientes,
      kmPercorrido: temDistancia ? Math.round(km * 10) / 10 : null,
      qtdParadasReal: veiculo?.qtd_paradas ?? 0,
      inicioViagem: veiculo?.inicio_viagem ? veiculo.inicio_viagem.toISOString() : null,
      fimViagem: veiculo?.fim_viagem ? veiculo.fim_viagem.toISOString() : null,
      paradasSemCliente,
    }
  })
}
