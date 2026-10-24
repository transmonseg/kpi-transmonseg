import { normPlaca } from '@/lib/unitrac-api'
import { placaFicticia } from './fonte-fusion'

/** F2-15 (MON-12): placas do relatorio do dia que nao estao no cadastro de
 *  rastreadores (kpi_rioquality_frota), com o numero de NFs, maior primeiro.
 *  Sem placa e placa de preenchimento (XXX, RQ-04) ficam de fora -- essas ja'
 *  sao "carga sem placa". */
export function placasForaDoCadastro(entregas: { placaNorm?: string | null }[], cvPorPlaca: Map<string, string>): { placa: string; nfs: number }[] {
  const cont = new Map<string, number>()
  for (const e of entregas) {
    const p = normPlaca(e.placaNorm ?? '')
    if (!p || placaFicticia(p) || cvPorPlaca.has(p)) continue
    cont.set(p, (cont.get(p) ?? 0) + 1)
  }
  return [...cont].map(([placa, nfs]) => ({ placa, nfs })).sort((a, b) => b.nfs - a.nfs || a.placa.localeCompare(b.placa))
}

/** Aviso interno (tela do Ao vivo, so' a equipe): a taxa nao muda -- placa
 *  real sem cv conta como "sem rastreador" (correta, regra de 04/10). */
export function avisoPlacasForaDoCadastro(fora: { placa: string; nfs: number }[]): string | null {
  if (fora.length === 0) return null
  const lista = fora.map(f => `${f.placa} (${f.nfs} ${f.nfs === 1 ? 'NF' : 'NFs'})`).join(', ')
  return `Placa(s) do relatório fora do cadastro de rastreadores da Rio Quality: ${lista}. Contam como "sem rastreador" (corretas) até entrarem no cadastro; a varredura de cv da Unitrac cadastra as que encontrar. Se a placa estiver digitada errada, corrija no relatório.`
}
