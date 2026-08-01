import { mapLimitSettled } from '@/lib/utils/map-limit'
import type { ResumoVeiculo } from '@/lib/types/unitrac'

const ORS_DIRECTIONS_URL = 'https://api.openrouteservice.org/v2/directions/driving-car'
// Limite documentado da Directions API do ORS — acima disso a API rejeita o
// pedido. Rotas com mais paradas são quebradas em blocos que compartilham o
// ponto de fronteira (senão perderíamos o trecho de conexão entre blocos).
const ORS_MAX_WAYPOINTS = 50

// Free tier do ORS: 40 req/min, documentado como janela deslizante — mas
// verificado ao vivo (56 veículos reais) que NÃO é "libera até 40 e bloqueia":
// mandar 40 de uma vez (mesmo dentro do limite teórico) devolveu 429 em ~1/3
// delas — bate com um token-bucket que não guarda rajada grande, só a taxa
// média. Espaçar uniformemente (1 a cada 1.500ms) rodou 100% limpo no mesmo
// teste; um burst de 40 imediatas não. NÃO trocar por "libera N por janela"
// sem testar de novo contra a API real primeiro.
const ORS_RATE_LIMIT = 40
const ORS_RATE_WINDOW_MS = 60_000
const INTERVALO_MIN_MS = ORS_RATE_WINDOW_MS / ORS_RATE_LIMIT
// Prazo total pro enriquecimento inteiro (não por veículo) — deixa margem
// dentro do maxDuration=120 da rota pra parsear escala/romaneio, montar o
// XLSX e responder. Veículo que não coube no prazo fica sem km (best-effort,
// mesma filosofia de sempre). Testado ao vivo com 56 veículos reais: no
// limite de 95s ainda tava rodando perto do fim — 85s dá folga de verdade.
const TEMPO_LIMITE_MS = 85_000
const CONCORRENCIA = 8

export type PontoRota = { lat: number; lng: number }
type AguardarVaga = () => Promise<void>

/** Espaçador de taxa por intervalo mínimo fixo — nunca deixa duas chamadas
 *  saírem com menos de `intervaloMs` de diferença (sem rajada, mesmo se
 *  várias chamadas pedirem vaga ao mesmo tempo). Lança quando `prazoAbsolutoMs`
 *  é ultrapassado, pra quem chama desistir daquele item em vez de travar. */
export function criarLimitador(intervaloMs: number, prazoAbsolutoMs: number): AguardarVaga {
  let proximoHorario = 0
  return async function aguardarVaga(): Promise<void> {
    const agora = Date.now()
    if (agora >= prazoAbsolutoMs) throw new Error('prazo de enriquecimento ORS esgotado')
    const horario = Math.max(agora, proximoHorario)
    if (horario > prazoAbsolutoMs) throw new Error('prazo de enriquecimento ORS esgotado')
    proximoHorario = horario + intervaloMs
    const espera = horario - agora
    if (espera > 0) await new Promise(r => setTimeout(r, espera))
  }
}

type OrsResponse = { routes?: Array<{ segments?: Array<{ distance?: number }> }> }

async function chamarOrsUmaVez(pontos: PontoRota[], apiKey: string): Promise<{ status: number; segments: number[] | null }> {
  try {
    const res = await fetch(ORS_DIRECTIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: apiKey,
      },
      body: JSON.stringify({ coordinates: pontos.map(p => [p.lng, p.lat]) }),
    })
    if (!res.ok) return { status: res.status, segments: null }
    const json = (await res.json()) as OrsResponse
    const segments = json.routes?.[0]?.segments
    if (!segments) return { status: res.status, segments: null }
    return { status: res.status, segments: segments.map(s => s.distance ?? 0) }
  } catch {
    return { status: 0, segments: null }
  }
}

/** Chama a ORS respeitando o espaçador; se vier 429 mesmo assim (jitter de
 *  rede, relógio), tenta 1 vez a mais depois de outro intervalo — não insiste
 *  além disso (best-effort). */
async function chamarOrs(pontos: PontoRota[], apiKey: string, aguardarVaga: AguardarVaga): Promise<number[] | null> {
  await aguardarVaga()
  const primeira = await chamarOrsUmaVez(pontos, apiKey)
  if (primeira.segments) return primeira.segments
  if (primeira.status !== 429) return null

  await aguardarVaga()
  const segunda = await chamarOrsUmaVez(pontos, apiKey)
  return segunda.segments
}

/** Distância real de rua (KM) entre cada par consecutivo de pontos, via ORS
 *  Directions API — índice i = trecho do ponto i pro ponto i+1, tamanho
 *  pontos.length - 1. Quebra em blocos de até ORS_MAX_WAYPOINTS (limite da
 *  API), blocos consecutivos compartilhando o ponto de fronteira. `aguardarVaga`
 *  é opcional (default: sem limitação) — quem processa vários veículos de
 *  uma vez (enriquecerComKmReal) passa um limitador compartilhado; uma
 *  chamada avulsa não precisa disso. Retorna null se a API falhar. */
export async function calcularDistanciasReais(
  pontos: PontoRota[],
  apiKey: string,
  aguardarVaga: AguardarVaga = async () => {},
): Promise<number[] | null> {
  if (pontos.length < 2) return []
  const distanciasM: number[] = []
  for (let inicio = 0; inicio < pontos.length - 1; inicio += ORS_MAX_WAYPOINTS - 1) {
    const bloco = pontos.slice(inicio, inicio + ORS_MAX_WAYPOINTS)
    if (bloco.length < 2) break
    const segs = await chamarOrs(bloco, apiKey, aguardarVaga)
    if (!segs) return null
    distanciasM.push(...segs)
  }
  return distanciasM.map(m => m / 1000)
}

/** Enriquece os resumos de viagem (vindos da API ao vivo do Unitrac, sem km)
 *  com distância real de rua por parada, via ORS. Atribui a distância do
 *  trecho anterior à parada de CHEGADA (1ª parada de cada veículo fica sem
 *  distancia_km — não há trecho anterior pra atribuir). Best-effort: veículo
 *  sem coordenada completa, com falha na ORS, ou que não coube no limite de
 *  taxa/prazo mantém como veio, sem quebrar a geração (mesma filosofia
 *  "em branco honesto" do resto do projeto) — com 60-90 veículos/dia e o
 *  espaçamento de 1.5s por chamada, nem sempre todos cabem no prazo. */
export async function enriquecerComKmReal(
  resumos: ResumoVeiculo[],
  apiKey: string,
): Promise<ResumoVeiculo[]> {
  const aguardarVaga = criarLimitador(INTERVALO_MIN_MS, Date.now() + TEMPO_LIMITE_MS)

  const settled = await mapLimitSettled(resumos, CONCORRENCIA, async (r): Promise<ResumoVeiculo> => {
    if (r.paradas.length < 2) return r
    if (r.paradas.some(p => p.lat == null || p.lng == null)) return r

    const pontos: PontoRota[] = r.paradas.map(p => ({ lat: p.lat as number, lng: p.lng as number }))
    const distancias = await calcularDistanciasReais(pontos, apiKey, aguardarVaga)
    if (!distancias) return r

    const paradas = r.paradas.map((p, i) => ({
      ...p,
      distancia_km: i === 0 ? null : (distancias[i - 1] ?? null),
    }))
    return { ...r, paradas }
  })

  return settled.map((s, i) => (s.status === 'fulfilled' ? s.value : resumos[i]))
}
