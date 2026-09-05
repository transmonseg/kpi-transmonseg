import { apiGet } from './client'
import { haversine } from '@/lib/utils/geo'
import { acharLojaPorCoordenada, type MapaPontos } from './pontos'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'

export type StopApiCru = { _data: string; tempoparada: number; latitude: number; longitude: number }

export type BaseCoord = { lat: number; lng: number }
export const BASE_BENASSI: BaseCoord = { lat: -22.8290, lng: -43.3420 }
export const RAIO_BASE_M = 500      // dentro disso da base → classificacao BASE
export const RAIO_CLUSTER_M = 150   // eventos a ≤150m do âncora = mesma permanência
export const MIN_DUR_SEM_GEO_SEG = 300 // cluster sem geofence só vira parada se ≥5min

/** Eventos crus da API, SEM o filtro de 120s (as entregas vêm fragmentadas). */
export async function buscarStopsCru(cv: string, horas: number): Promise<StopApiCru[]> {
  const d = (await apiGet(`/mapa_servicos/stops/${cv}/${horas}`)) as { paradas?: StopApiCru[] } | null
  return (d?.paradas ?? []).filter(p => p.latitude != null && p.longitude != null && Math.abs(p.latitude) > 1)
}

export type Cluster = { eventos: StopApiCru[]; lat: number; lng: number }

/** Agrupa eventos consecutivos (por tempo) que ficam a ≤RAIO_CLUSTER_M do âncora
 *  (1º evento do grupo) numa "permanência" no mesmo local. */
export function clusteriza(eventos: StopApiCru[]): Cluster[] {
  const ord = [...eventos].sort((a, b) => new Date(a._data).getTime() - new Date(b._data).getTime())
  const clusters: Cluster[] = []
  for (const e of ord) {
    const atual = clusters[clusters.length - 1]
    if (atual && haversine(atual.lat, atual.lng, e.latitude, e.longitude) <= RAIO_CLUSTER_M) {
      atual.eventos.push(e)
    } else {
      clusters.push({ eventos: [e], lat: e.latitude, lng: e.longitude })
    }
  }
  return clusters
}

/** Eventos crus → paradas no formato que o matcher consome.
 *  - filtra a janela do dia (`_data` já vem em BRT mascarado como UTC)
 *  - clusteriza permanências
 *  - saída = chegada do PRÓXIMO cluster (o caminhão "saiu" ao aparecer noutro lugar);
 *    no último cluster, saída = último evento + sua duração
 *  - fim_real = SEMPRE último evento do próprio cluster + sua duração — quando
 *    terminou de verdade, sem incluir o trajeto até o próximo lugar (`saida`
 *    inclui; usado por quem precisa de duração real de permanência, ex.
 *    "tempo na loja" da Nutry Max — ver kpi-loja.ts)
 *  - resolve geofence autoritativa; classifica BASE/LOJA/FORA_BASE
 *  - descarta cluster curto sem geofence (blip de trânsito) */
export function consolidaParadasApi(
  eventos: StopApiCru[],
  pontos: MapaPontos,
  data: string,
  placaNorm: string,
  /** Uma ou mais bases/garagens da conta — algumas contas (Nutrimax) têm mais
   *  de um CD físico, e um cluster dentro do raio de QUALQUER uma delas conta
   *  como BASE. */
  baseCoord: BaseCoord | BaseCoord[] = BASE_BENASSI,
): UnitracParadaRow[] {
  const baseCoords = Array.isArray(baseCoord) ? baseCoord : [baseCoord]
  const doDia = eventos.filter(e => e._data.slice(0, 10) === data)
  const clusters = clusteriza(doDia)
  const out: UnitracParadaRow[] = []
  let ordem = 0
  for (let i = 0; i < clusters.length; i++) {
    const c = clusters[i]
    const ultimo = c.eventos[c.eventos.length - 1]
    const chegada = c.eventos[0]._data
    const proximo = clusters[i + 1]
    // `tempoparada` da Unitrac vem em MINUTOS (achado real 05/09, conferido
    // nos eventos crus de producao: tempoparada=4 com 8 min ate o proximo
    // evento, 20 -> 26, 11 -> 16, 22 -> 25 -- a diferenca e' o deslocamento).
    // Antes multiplicava por 1000 tratando como segundos: fim_real ficava 60x
    // curto, "TEMPO NA LOJA" saia 0h00min em 31 de 33 entregas da Rio Quality
    // e a SAIDA DO CD virava o horario de CHEGADA na base.
    const fimReal = new Date(new Date(ultimo._data).getTime() + (ultimo.tempoparada ?? 0) * 60_000).toISOString()
    const saida = proximo ? proximo.eventos[0]._data : fimReal
    const durSeg = Math.round((new Date(saida).getTime() - new Date(chegada).getTime()) / 1000)

    const naBase = baseCoords.some(bc => haversine(bc.lat, bc.lng, c.lat, c.lng) <= RAIO_BASE_M)
    const geo = naBase ? null : acharLojaPorCoordenada(c.lat, c.lng, pontos)
    const classificacao = naBase ? 'BASE' : geo ? 'LOJA' : 'FORA_BASE'

    // blip de trânsito: cluster curto sem geofence de loja → descarta.
    // Achado real 25/08 (dado real RQU-1G17, reclamação "tempo operação
    // 0h04min" com 18km rodados): antes exigia `!naBase` aqui, entao
    // qualquer cluster dentro do raio da base (500m) virava um evento BASE
    // completo sem NENHUM minimo de permanencia -- passar perto da base no
    // transito (sinal de GPS parado num semaforo, engarrafamento) contava
    // como "chegou na base", corrompendo saidaCd/chegadaCd em agregacao.ts
    // (que so olha o 1o e o ultimo evento BASE do dia). LOJA continua sem
    // minimo (geofence resolvida e' autoritativa), so BASE generica e
    // FORA_BASE sem geofence precisam do dwell minimo de verdade.
    if (!geo && durSeg < MIN_DUR_SEM_GEO_SEG) continue

    ordem++
    out.push({
      id: `${placaNorm}-api-${ordem}`,
      placa_norm: placaNorm,
      chegada: new Date(chegada).toISOString(),
      saida: new Date(saida).toISOString(),
      fim_real: fimReal,
      duracao_seg: durSeg,
      local_parada: geo ? geo.nome : naBase ? 'BASE BENASSI - BASE BENASSI' : 'FORA DE BASE E LOCAL DE SERVICO',
      codigo_loja: geo?.cod ?? null,
      nome_loja: geo?.nome ?? null,
      lat: c.lat,
      lng: c.lng,
      endereco: null,
      classificacao,
      ordem,
    })
  }
  return out
}
