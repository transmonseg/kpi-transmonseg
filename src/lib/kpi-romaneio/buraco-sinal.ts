// F2-07 (KN-05, plano mestre 23/10): "NÃO FOI AO CLIENTE" afirmado dentro de
// um buraco de sinal. Caso real RQV9B26 em 22/10: o GPS congelou das 12:30 às
// 14:09 e a Unitrac gravou isso como uma "parada" de 112 min (api-9, 12:18–
// 14:10); a parada seguinte (api-10, 14:11) começa 9,5 km a leste -- salto
// impossível. A NF 2438528 SUPER COMPRAS (ponto aprendido com 4 entregas)
// fica a ~200 m da reta do salto e saiu "NÃO FOI AO CLIENTE".
//
// Buraco = parada da cadeia da própria placa seguida de salto impossível
// (> 3 km a > 100 km/h entre o fim dela e o começo da próxima). O carro
// esteve em algum lugar entre as duas, sem ser visto, desde o começo da
// parada suspeita (o congelamento começa durante ela) até a próxima.
// Só troca o rótulo do NÃO FOI; a NF continua pendente (a taxa não muda).
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import { haversine } from '@/lib/utils/geo'

/** Salto entre paradas seguidas: mais que isso, a mais que VELOCIDADE_IMPOSSIVEL_KMH. */
const SALTO_MIN_M = 3_000
const VELOCIDADE_IMPOSSIVEL_KMH = 100
/** Buraco curto não esconde ida ao cliente. */
const BURACO_MIN_MIN = 15
/** Cliente "na reta" do salto: d(A,P) + d(P,B) - d(A,B) até isto. */
const DESVIO_MAX_M = 3_000
/** Ou dá tempo de ir A -> cliente -> B nessa velocidade, com essa parada. */
const VELOCIDADE_DESVIO_KMH = 40
const PARADA_NO_CLIENTE_MIN = 5

export const PREFIXO_OBS_SEM_SINAL_NO_TRECHO = 'SEM SINAL NO TRECHO DO CLIENTE'

export type BuracoSinal = {
  /** Horários como vêm da parada (Brasília mascarado como UTC). */
  inicio: string
  fim: string
  duracaoMin: number
  saltoM: number
  a: { lat: number; lng: number }
  b: { lat: number; lng: number }
}

type ParadaComPonto = UnitracParadaRow & { lat: number; lng: number }
const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN)

/** Pares (parada, proxima) da cadeia de UMA fonte com salto impossivel entre
 *  o fim de uma e o comeco da outra. */
function saltosImpossiveis(paradas: UnitracParadaRow[]): { a: ParadaComPonto; b: ParadaComPonto; saltoM: number }[] {
  const cadeia = paradas
    .filter((p): p is ParadaComPonto => p.lat != null && p.lng != null && Number.isFinite(ms(p.chegada)))
    .sort((x, y) => ms(x.chegada) - ms(y.chegada))
  const out: { a: ParadaComPonto; b: ParadaComPonto; saltoM: number }[] = []
  for (let i = 0; i + 1 < cadeia.length; i++) {
    const a = cadeia[i], b = cadeia[i + 1]
    const saltoM = haversine(a.lat, a.lng, b.lat, b.lng)
    if (saltoM <= SALTO_MIN_M) continue
    const fimA = ms(a.fim_real ?? a.saida ?? a.chegada)
    const horas = Math.max(0, ms(b.chegada) - (Number.isFinite(fimA) ? fimA : ms(a.chegada))) / 3_600_000
    if (horas === 0 || saltoM / 1000 / horas > VELOCIDADE_IMPOSSIVEL_KMH) out.push({ a, b, saltoM })
  }
  return out
}

/** F2-08 (KN-07, RQV9B26 22/10 api-1): parada seguida de salto impossivel e'
 *  posicao congelada -- nao serve de local da entrega (parada-fora-do-
 *  endereco.ts) nem de ponto da parada no Ao vivo. Uma fonte por chamada. */
export function paradasSeguidasDeSaltoImpossivel(paradas: UnitracParadaRow[]): Set<UnitracParadaRow> {
  return new Set(saltosImpossiveis(paradas).map(x => x.a))
}

/** Buracos de sinal na cadeia de paradas de UMA fonte (não misturar ponte e
 *  Unitrac: as duas cadeias juntas fabricariam saltos entre fontes). */
export function acharBuracosDeSinal(paradas: UnitracParadaRow[]): BuracoSinal[] {
  const buracos: BuracoSinal[] = []
  for (const { a, b, saltoM } of saltosImpossiveis(paradas)) {
    const duracaoMin = (ms(b.chegada) - ms(a.chegada)) / 60_000
    if (duracaoMin < BURACO_MIN_MIN) continue
    buracos.push({ inicio: a.chegada, fim: b.chegada, duracaoMin: Math.round(duracaoMin), saltoM: Math.round(saltoM), a: { lat: a.lat, lng: a.lng }, b: { lat: b.lat, lng: b.lng } })
  }
  return buracos
}

/** Primeiro buraco em que o cliente cabe: perto da reta do salto, ou com
 *  tempo de ir até ele e voltar ao caminho dentro do buraco. */
export function buracoCompativel(ponto: { lat: number; lng: number }, buracos: BuracoSinal[]): BuracoSinal | null {
  for (const b of buracos) {
    const ida = haversine(b.a.lat, b.a.lng, ponto.lat, ponto.lng)
    const volta = haversine(ponto.lat, ponto.lng, b.b.lat, b.b.lng)
    const desvioM = ida + volta - b.saltoM
    const minutosPeloCliente = ((ida + volta) / 1000 / VELOCIDADE_DESVIO_KMH) * 60 + PARADA_NO_CLIENTE_MIN
    if (desvioM <= DESVIO_MAX_M || minutosPeloCliente <= b.duracaoMin) return b
  }
  return null
}

const hhmm = (iso: string) => iso.slice(11, 16)

export function obsSemSinalNoTrecho(b: BuracoSinal): string {
  return `${PREFIXO_OBS_SEM_SINAL_NO_TRECHO} (${hhmm(b.inicio)}–${hhmm(b.fim)}) - CONFERIR`
}

export function motivoSemSinalNoTrecho(b: BuracoSinal): string {
  return `Rastreador sem sinal entre ${hhmm(b.inicio)} e ${hhmm(b.fim)} (salto de ${(b.saltoM / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km entre duas paradas) e o cliente cabe nesse trecho — não dá pra afirmar que não foi`
}
