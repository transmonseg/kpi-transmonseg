// Fim da rota = ultima entrega do dia (achado 22/09, RBG5G18 21/09): a
// CHEGADA CD tem que ser a primeira volta a base DEPOIS disso; uma saida
// extra sem entrega nao e' rota. Tudo na convencao mascarada (digitos BRT + Z).
import type { Visita } from './types'
import type { AlvoApi } from '@/lib/unitrac-api'
import { buscarHorariosBase, type HorarioBase, type ParadaBridge } from './base-horarios'
// instanteDeFeitoISO duplicava aqui como `instante()` (mesma regex, mesma
// semantica) -- unificado em correcao-por-alvo.ts (revisao do controller,
// 22/09): sem import circular, correcao-por-alvo.ts nao importa nada deste
// arquivo.
import { instanteDeFeitoISO } from './correcao-por-alvo'

export const FOLGA_VOLTA_EXTRA_MIN = 30

/** Maior instante entre saida das visitas (mascarado) e feitoISO dos alvos
 *  situacao=1 (digitos BRT). Retorna ISO mascarado (toISOString) ou null. */
export function fimDaRota(visitas: Iterable<Visita>, alvosDaPlaca: AlvoApi[]): string | null {
  let max = -Infinity
  for (const v of visitas) if (v.saida) max = Math.max(max, instanteDeFeitoISO(v.saida))
  for (const a of alvosDaPlaca) if (a.situacao === 1 && a.feitoISO) max = Math.max(max, instanteDeFeitoISO(a.feitoISO))
  return Number.isFinite(max) ? new Date(max).toISOString() : null
}

/** true se ha parada BASE com chegada >= fimRota e (chegadaBase - essa
 *  chegada) > FOLGA_VOLTA_EXTRA_MIN. Tudo mascarado. */
export function precisaAjustarChegada(paradas: ParadaBridge[], fimRota: string | null, chegadaBase: string | null): boolean {
  if (!fimRota || !chegadaBase) return false
  const fim = instanteDeFeitoISO(fimRota), chegada = instanteDeFeitoISO(chegadaBase)
  return paradas.some(p => p.classificacao === 'BASE'
    && instanteDeFeitoISO(p.chegada) >= fim
    && (chegada - instanteDeFeitoISO(p.chegada)) / 60_000 > FOLGA_VOLTA_EXTRA_MIN)
}

/** true se a NF foi confirmada pra essa placa: visita registrada (GPS
 *  proprio) OU alvo Unitrac com situacao=1 (feito) pra essa NF. */
function nfConfirmada(nf: string, visitasDaPlaca: Map<string, Visita>, alvosDaPlaca: AlvoApi[]): boolean {
  return visitasDaPlaca.has(nf) || alvosDaPlaca.some(a => a.situacao === 1 && a.documento === nf)
}

/** Ruling do controller (revisao final 22/09): so' ajusta a placa quando
 *  TODAS as NFs do romaneio dela estao confirmadas. Se alguma NF ainda nao
 *  foi confirmada, uma 2a saida real pode te-la entregue -- nao mexe. */
function todasNfsConfirmadas(nfs: string[], visitasDaPlaca: Map<string, Visita>, alvosDaPlaca: AlvoApi[]): boolean {
  return nfs.every(nf => nfConfirmada(nf, visitasDaPlaca, alvosDaPlaca))
}

/** Liga fimDaRota/precisaAjustarChegada na busca de horarios: pra cada placa
 *  cuja ULTIMA volta a base registrada e' na verdade uma volta extra sem
 *  entrega (fim da rota veio antes dela, com folga > FOLGA_VOLTA_EXTRA_MIN)
 *  E cuja TODAS as NFs do romaneio ja' estao confirmadas (ruling do
 *  controller -- carga transferida de outra placa numa 2a saida nao e'
 *  detectada, aceito como limitacao), repete buscarHorariosBase so' pra ela
 *  mandando `fimRotaPorPlaca` -- a ponte entao devolve a PRIMEIRA volta a
 *  base depois do fim da rota, que e' a CHEGADA CD de verdade. So' copia
 *  chegadaBase/kmPercorrido da 2a chamada -- saidaBase fica o da 1a. Muta
 *  horarioBasePorPlaca in-place (mesmo padrao de mapComLimite acima na
 *  route). Fail-open: ponte falhando ou devolvendo chegadaBase null na 2a
 *  chamada mantem os valores da 1a, sem mudar nada pra aquela placa. */
export async function ajustarChegadaAposUltimaEntrega(
  placasNorm: string[],
  data: string,
  horarioBasePorPlaca: Map<string, HorarioBase>,
  visitasPorPlaca: Map<string, Map<string, Visita>>,
  alvosPorPlaca: Map<string, AlvoApi[]>,
  nfsPorPlaca: Map<string, string[]>,
): Promise<void> {
  const fimPorPlaca = new Map<string, string>()
  for (const p of placasNorm) {
    const h = horarioBasePorPlaca.get(p)
    const visitasDaPlaca = visitasPorPlaca.get(p) ?? new Map()
    const alvosDaPlaca = alvosPorPlaca.get(p) ?? []
    const fim = fimDaRota(visitasDaPlaca.values(), alvosDaPlaca)
    if (h && precisaAjustarChegada(h.paradas ?? [], fim, h.chegadaBase)
      && todasNfsConfirmadas(nfsPorPlaca.get(p) ?? [], visitasDaPlaca, alvosDaPlaca)) fimPorPlaca.set(p, fim as string)
  }
  if (fimPorPlaca.size === 0) return
  const ajustado = await buscarHorariosBase([...fimPorPlaca.keys()], data, new Map(), false, fimPorPlaca)
  const sobrescritas: string[] = []
  const naoSobrescritas: string[] = []
  for (const p of fimPorPlaca.keys()) {
    const novo = ajustado.get(p)
    const atual = horarioBasePorPlaca.get(p)
    if (atual && novo && novo.chegadaBase) {
      const antiga = atual.chegadaBase
      horarioBasePorPlaca.set(p, { ...atual, chegadaBase: novo.chegadaBase, kmPercorrido: novo.kmPercorrido })
      sobrescritas.push(`${p}: ${antiga} -> ${novo.chegadaBase}`)
    } else {
      naoSobrescritas.push(p)
    }
  }
  if (sobrescritas.length > 0) console.log(`[kpi] chegada CD ajustada apos ultima entrega: ${sobrescritas.join(', ')}`)
  if (naoSobrescritas.length > 0) console.log(`[kpi] chegada CD pedida mas nao ajustada (2a chamada sem chegadaBase) apos ultima entrega: ${naoSobrescritas.join(', ')}`)
}
