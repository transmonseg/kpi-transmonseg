import { haversine } from '@/lib/utils/geo'
import type { EventoRavex, Visita } from './types'
import { RAIO_ENTREGA_METROS } from './constants'

type ClienteParaVisita = { codigoCliente: string; lat: number | null; lng: number | null }

/** Clusteriza o stream de evento cru da Ravex em visitas por cliente.
 *  Pra cada evento (em ordem cronologica), acha o cliente geocodificado
 *  mais proximo dentro do raio; eventos consecutivos que caem no MESMO
 *  cliente estendem a visita corrente (saida = evento mais recente);
 *  evento que cai num cliente diferente fecha a visita anterior e abre
 *  uma nova. Evento fora do raio de qualquer cliente e ignorado. */
export function montarVisitas(eventos: EventoRavex[], clientes: ClienteParaVisita[]): Map<string, Visita> {
  const clientesComCoord = clientes.filter(
    (c): c is ClienteParaVisita & { lat: number; lng: number } => c.lat != null && c.lng != null,
  )
  const visitas = new Map<string, Visita>()
  const eventosOrdenados = [...eventos].sort((a, b) => new Date(a.dataHora).getTime() - new Date(b.dataHora).getTime())

  for (const evento of eventosOrdenados) {
    let melhor: { cliente: ClienteParaVisita & { lat: number; lng: number }; dist: number } | null = null
    for (const cliente of clientesComCoord) {
      const dist = haversine(evento.lat, evento.lng, cliente.lat, cliente.lng)
      if (dist > RAIO_ENTREGA_METROS) continue
      if (!melhor || dist < melhor.dist) melhor = { cliente, dist }
    }
    if (!melhor) continue

    const existente = visitas.get(melhor.cliente.codigoCliente)
    if (existente) {
      existente.saida = evento.dataHora
      if (evento.temperatura != null) existente.temperaturas.push(evento.temperatura)
    } else {
      visitas.set(melhor.cliente.codigoCliente, {
        codigoCliente: melhor.cliente.codigoCliente,
        chegada: evento.dataHora,
        saida: evento.dataHora,
        distanciaMetrosDoPonto: melhor.dist,
        temperaturas: evento.temperatura != null ? [evento.temperatura] : [],
      })
    }
  }

  return visitas
}
