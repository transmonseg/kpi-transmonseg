// F4-10 (KRQ-13): check-in da Fusion (app do motorista da RQ) como PISTA na
// investigação das não entregues -- "check-in às HH:MM com o caminhão parado
// a N km do ponto". Nunca vale como ENTREGUE: em 20/10, 372 dos 387 "revisar"
// tinham check-in numa parada da placa (336 a mais de 2 km do nosso ponto),
// mas o local do check-in do mesmo cliente concorda entre dias só em 47% (até
// 200 m). Aprender ponto com ele fica para depois da medição (2 semanas).
import { montarLinhasRomaneioCompleto, removerEntregasRepetidas, type EntregaRioQualityCompleta } from './parse-planilhas'
import { placaFicticia } from '../fusion/entregas'

/** "AAAA-MM-DD HH:MM:SS" (grade) ou "DD/MM/AAAA HH:MM:SS" (55 colunas), hora
 *  local de Brasília -> ISO no relógio da Unitrac (Brasília mascarado como UTC). */
export function checkInComoIsoUnitrac(s: string | null | undefined): string | null {
  const t = (s ?? '').trim()
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? '00'}.000Z`
  m = t.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})(?::(\d{2}))?/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6] ?? '00'}.000Z`
  return null
}

/** Check-in por NF, com a MESMA chave de NF da geração (montarLinhasRomaneioCompleto,
 *  depois da regra da placa de preenchimento, como no pipeline). */
export function checkInsPorNfRQ(entregas: EntregaRioQualityCompleta[]): Map<string, string> {
  // KPI-01: sem a cópia idêntica, como no pipeline (índice de norm = índice de linhas).
  const norm = removerEntregasRepetidas(entregas.map(e => (placaFicticia(e.placaNorm) ? { ...e, placaNorm: '' } : e))).entregas
  const { linhas } = montarLinhasRomaneioCompleto(norm)
  const out = new Map<string, string>()
  norm.forEach((e, i) => {
    const iso = checkInComoIsoUnitrac(e.gabarito?.dataCheckIn)
    if (iso && linhas[i]) out.set(linhas[i].nf, iso)
  })
  return out
}
