import { haversine } from '@/lib/utils/geo'
import { apiGet } from '@/lib/unitrac-api/client'

// KM percorrido a partir do RASTRO da Unitrac (/mapa_servicos/rastro/{cv}/{horas}).
//
// Por que nao a soma da reta entre PARADAS (o que a Rio Quality usava ate
// 05/09): subestima 43% a 65% -- medido contra a verdade da Nutry Max
// (posicoes_historico, coleta continua ~35s) em 6 placas de 03/09: 230 km
// contra 523 reais, 167 contra 475, 170 contra 387.
//
// O rastro bate: mesma janela de 12h, rastro x verdade --
//   RQU6E83  19,5 x 19 | RQV4F38 160,0 x 158
//   TOS1I21 393,8 x 394 | RQV9E67 176,3 x 175
// A lista vem em ordem cronologica e densa (passo mediano 0m, p90 80m, sem
// salto), entao somar consecutivos e' valido. Pontos repetidos de veiculo
// parado somam zero -- nao acumula jitter (a coleta ponto-a-ponto do banco
// acumula: um veiculo parado o dia todo "andou" 26 km la').
//
// O rastro NAO traz timestamp, so' "ultimas N horas". Entao o dia sai por
// SUBTRACAO: km(desde o inicio do dia) - km(desde o inicio do dia seguinte).
// A janela do lado da Unitrac parece ancorada em BRT -- na pratica o corte
// cai ~03:00 BRT, o que ate' ajuda: nao parte no meio o retorno noturno pra
// base (jornada real vai de ~05:00 a ~22:00).

export type PontoRastro = { lat: number; long: number }

const HORAS_MAX_RASTRO = 96 // alem disso a API fica pouco confiavel

export function somarKmDoRastro(pontos: PontoRastro[]): number {
  const validos = pontos.filter(
    p => Number.isFinite(p?.lat) && Number.isFinite(p?.long) && Math.abs(p.lat) > 1 && Math.abs(p.long) > 1,
  )
  let metros = 0
  for (let i = 1; i < validos.length; i++) {
    metros += haversine(validos[i - 1].lat, validos[i - 1].long, validos[i].lat, validos[i].long)
  }
  return metros / 1000
}

/** Horas (a contar de `agora`) do inicio do dia pedido e do inicio do dia
 *  seguinte. `horasFim` = 0 quando o dia pedido e' hoje. null quando a data
 *  e' futura ou esta' fora do alcance do rastro. */
export function janelasDoDia(
  data: string,
  agora: Date,
): { horasInicio: number; horasFim: number } | null {
  // 00:00 BRT = 03:00 UTC
  const inicioDia = new Date(`${data}T03:00:00Z`).getTime()
  const inicioDiaSeguinte = inicioDia + 24 * 3_600_000
  const t = agora.getTime()
  if (!Number.isFinite(inicioDia) || inicioDia > t) return null
  const horasInicio = Math.round((t - inicioDia) / 3_600_000)
  if (horasInicio > HORAS_MAX_RASTRO) return null
  const horasFim = inicioDiaSeguinte > t ? 0 : Math.round((t - inicioDiaSeguinte) / 3_600_000)
  return { horasInicio, horasFim }
}

export async function buscarRastro(cv: string, horas: number): Promise<PontoRastro[]> {
  const d = (await apiGet(`/mapa_servicos/rastro/${cv}/${horas}`)) as { posicoes?: PontoRastro[] } | null
  return d?.posicoes ?? []
}

/** Km do dia pra um veiculo. null (nunca 0) quando nao da' pra afirmar --
 *  data fora do alcance, rastro vazio, subtracao negativa ou falha na API.
 *  "Sem dado" e' diferente de "nao andou". */
export async function calcularKmPorRastro(
  cv: string,
  data: string,
  buscar: (cv: string, horas: number) => Promise<PontoRastro[]> = buscarRastro,
  agora: Date = new Date(),
): Promise<number | null> {
  const janelas = janelasDoDia(data, agora)
  if (!janelas) return null
  try {
    const pontosInicio = await buscar(cv, janelas.horasInicio)
    if (pontosInicio.length < 2) return null
    const kmInicio = somarKmDoRastro(pontosInicio)
    if (janelas.horasFim === 0) return kmInicio
    const kmFim = somarKmDoRastro(await buscar(cv, janelas.horasFim))
    const km = kmInicio - kmFim
    return km < 0 ? null : km
  } catch (e) {
    console.error('[kpi-rioquality/km-rastro] falha ao buscar rastro:', e instanceof Error ? e.message : String(e))
    return null
  }
}
