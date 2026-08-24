import { haversine } from '@/lib/utils/geo'
import type { EventoRavex, Visita } from './types'
import { RAIO_ENTREGA_METROS } from './constants'

type ClienteParaVisita = { codigoCliente: string; lat: number | null; lng: number | null }

function duracaoMs(v: Visita): number {
  return new Date(v.saida).getTime() - new Date(v.chegada).getTime()
}

/** Clusteriza o stream de evento cru da Ravex em visitas por cliente.
 *  Pra cada evento (em ordem cronologica), acha o cliente geocodificado
 *  mais proximo dentro do raio; SO' eventos CONSECUTIVOS (na sequencia
 *  cronologica) que caem no mesmo cliente estendem a mesma visita --
 *  um evento isolado ao mesmo cliente, depois de um trecho visitando
 *  outro cliente (ex: rota passa de novo perto da mesma rua na volta),
 *  vira um NOVO candidato de visita, nao uma extensao da visita antiga.
 *  Se dois candidatos de visita pro MESMO cliente aparecerem (visitas
 *  nao-adjacentes), fica o de MAIOR duracao -- mesmo criterio ja usado
 *  no modulo irmao da Nutry Max (kpi-romaneio/visitas.ts) pro mesmo tipo
 *  de conflito: parada mais longa e' mais provavel de ser a entrega
 *  real, nao ruido de GPS passando de novo pela rua. */
export function montarVisitas(eventos: EventoRavex[], clientes: ClienteParaVisita[]): Map<string, Visita> {
  const clientesComCoord = clientes.filter(
    (c): c is ClienteParaVisita & { lat: number; lng: number } => c.lat != null && c.lng != null,
  )
  const visitas = new Map<string, Visita>()
  const eventosOrdenados = [...eventos].sort((a, b) => new Date(a.dataHora).getTime() - new Date(b.dataHora).getTime())

  let runAtual: Visita | null = null

  function fecharRun() {
    if (!runAtual) return
    const existente = visitas.get(runAtual.codigoCliente)
    if (!existente || duracaoMs(runAtual) > duracaoMs(existente)) {
      visitas.set(runAtual.codigoCliente, runAtual)
    }
    runAtual = null
  }

  for (const evento of eventosOrdenados) {
    let melhor: { cliente: ClienteParaVisita & { lat: number; lng: number }; dist: number } | null = null
    for (const cliente of clientesComCoord) {
      const dist = haversine(evento.lat, evento.lng, cliente.lat, cliente.lng)
      if (!Number.isFinite(dist) || dist > RAIO_ENTREGA_METROS) continue
      if (!melhor || dist < melhor.dist) melhor = { cliente, dist }
    }

    if (!melhor) {
      fecharRun()
      continue
    }

    if (runAtual && runAtual.codigoCliente === melhor.cliente.codigoCliente) {
      runAtual.saida = evento.dataHora
      if (evento.temperatura != null) runAtual.temperaturas.push(evento.temperatura)
    } else {
      fecharRun()
      runAtual = {
        codigoCliente: melhor.cliente.codigoCliente,
        chegada: evento.dataHora,
        saida: evento.dataHora,
        distanciaMetrosDoPonto: melhor.dist,
        temperaturas: evento.temperatura != null ? [evento.temperatura] : [],
      }
    }
  }
  fecharRun()

  return visitas
}
