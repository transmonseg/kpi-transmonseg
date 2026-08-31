import { haversine } from '@/lib/utils/geo'
// UnitracParadaRow é definido em matcher.ts (Benassi), não em unitrac-api --
// mesma ressalva de unitrac.ts (Task 6).
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import type { LinhaGeocodificada, Visita } from './types'
import { RAIO_ENTREGA_METROS } from './constants'

/** Pra cada linha geocodificada da placa, acha a parada FORA_BASE cujo
 *  centro do cluster caiu dentro do nosso raio -- nunca do raio que a
 *  Unitrac cadastrou pro alvo (esse tem erro conhecido, ver spec).
 *  Quando duas linhas geocodificadas ficam perto uma da outra, cada
 *  parada e atribuida ao ponto MAIS PROXIMO (nao ao primeiro que bate),
 *  pra nao "roubar" a visita de um ponto vizinho. */
export function montarVisitas(
  linhas: LinhaGeocodificada[],
  paradas: UnitracParadaRow[],
  // Achado real 25/08: fonte PREFERIDA de CHEGADA/SAIDA NA LOJA, via
  // cruzamento de geofence direto na coordenada de CADA ponto (ver
  // base-horarios.ts/acharVisitasPorPonto do lado do monitoramento) --
  // sem competir por cluster de parada nenhum, ao contrario do algoritmo
  // abaixo (que casa parada da Unitrac com o ponto geocodificado mais
  // proximo). `undefined` na entrada do mapa pra uma NF = a ponte nao
  // respondeu por ela (offline, sem pontos geocodificados ainda) -- essa
  // NF mantem o resultado do algoritmo antigo abaixo. Entrada PRESENTE
  // (mesmo com chegada/saida null) = a ponte confia que a NF nunca foi
  // visitada de verdade -- REMOVE qualquer guess do algoritmo antigo pra
  // essa NF em vez de manter (mesmo raciocinio de "confia no null da
  // ponte" ja usado em agregarPorCarga pra saida/chegada/km da base).
  visitasPorNfBridge?: Map<string, { chegada: string | null; saida: string | null; viaVizinhanca?: boolean }>,
): Map<string, Visita> {
  // nf -> Visita
  const visitas = new Map<string, Visita>()
  const linhasComCoord = linhas.filter((l): l is LinhaGeocodificada & { lat: number; lng: number } => l.lat != null && l.lng != null)

  for (const parada of paradas) {
    if (parada.classificacao !== 'FORA_BASE') continue
    if (parada.lat == null || parada.lng == null) continue

    let melhor: { linha: LinhaGeocodificada; dist: number } | null = null
    for (const linha of linhasComCoord) {
      const dist = haversine(parada.lat, parada.lng, linha.lat as number, linha.lng as number)
      if (dist > RAIO_ENTREGA_METROS) continue
      if (!melhor || dist < melhor.dist) melhor = { linha, dist }
    }
    if (!melhor) continue

    const existente = visitas.get(melhor.linha.nf)
    // se ja existe visita pra essa NF, fica a de MAIOR duracao (parada mais
    // longa e mais provavel de ser a entrega real, nao um trafego lento).
    // Fallback pra parada.chegada quando fim_real/saida vierem null -- so
    // acontece em produtores antigos (nunca em consolidaParadasApi, que
    // sempre preenche os dois), mantido so por seguranca de tipo.
    const saidaEfetiva = parada.fim_real ?? parada.saida ?? parada.chegada
    const duracaoNova = new Date(saidaEfetiva).getTime() - new Date(parada.chegada).getTime()
    const duracaoExistente = existente ? new Date(existente.saida).getTime() - new Date(existente.chegada).getTime() : -1
    if (duracaoNova > duracaoExistente) {
      visitas.set(melhor.linha.nf, {
        nf: melhor.linha.nf,
        chegada: parada.chegada,
        saida: saidaEfetiva,
        distanciaMetrosDoPonto: melhor.dist,
      })
    }
  }

  if (visitasPorNfBridge) {
    for (const linha of linhas) {
      const doPonte = visitasPorNfBridge.get(linha.nf)
      if (doPonte === undefined) continue // ponte nao respondeu por essa NF -- mantem o resultado antigo
      if (doPonte.chegada && doPonte.saida) {
        // distanciaMetrosDoPonto nao faz sentido aqui (a ponte confirma
        // presenca dentro do raio do PROPRIO ponto, nao casa contra
        // varios candidatos) -- 0, nunca lido em nenhum outro lugar do
        // pipeline (so' escrito, ver grep).
        visitas.set(linha.nf, { nf: linha.nf, chegada: doPonte.chegada, saida: doPonte.saida, distanciaMetrosDoPonto: 0, viaVizinhanca: doPonte.viaVizinhanca === true })
      } else {
        visitas.delete(linha.nf)
      }
    }
  }

  return visitas
}
