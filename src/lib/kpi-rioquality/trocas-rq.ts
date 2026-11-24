// 24/11 (Ana: "podemos colocar o sistema de trocas de placa na Rio Quality?"):
// a troca da RQ usa a mesma tabela kpi_troca_placa da Nutry, com o ROMANEIO
// no lugar da carga (1 romaneio por placa no dia). A troca é aplicada nas
// entregas guardadas do dia antes do cálculo e do envio ao monitoramento.
import { aplicarTrocasDePlaca, type TrocaPlaca } from '@/lib/kpi-romaneio/trocas-placa'
import { removerEntregasRepetidas, type EntregaRioQualityCompleta } from './parse-planilhas'

/** Entregas com a placa trocada (romaneio -> placa real, ou placa inteira). */
export function aplicarTrocasRQ(entregas: EntregaRioQualityCompleta[], trocas: TrocaPlaca[]): EntregaRioQualityCompleta[] {
  if (trocas.length === 0) return entregas
  const tmp = entregas.map(e => ({ carga: e.romaneio ?? '', placa: e.placaNorm, e }))
  const { romaneio } = aplicarTrocasDePlaca(tmp, [], trocas)
  return romaneio.map(r => (r.placa === r.e.placaNorm ? r.e : { ...r.e, placaNorm: r.placa }))
}

/** Linhas {nf, carga (romaneio), placa} com a NF como o monitoramento grava
 *  (NF repetida ganha o sufixo -2, -3, igual linhasParaMonitoramentoRQ). */
export function linhasTrocaRQ(entregas: EntregaRioQualityCompleta[]): { nf: string; carga: string; placa: string }[] {
  const usadas = new Map<string, number>()
  const out: { nf: string; carga: string; placa: string }[] = []
  for (const e of removerEntregasRepetidas(entregas).entregas) {
    if (!e.nf) continue
    const k = (usadas.get(e.nf) ?? 0) + 1
    usadas.set(e.nf, k)
    if (!e.placaNorm) continue
    out.push({ nf: k === 1 ? e.nf : `${e.nf}-${k}`, carga: e.romaneio ?? '', placa: e.placaNorm })
  }
  return out
}
