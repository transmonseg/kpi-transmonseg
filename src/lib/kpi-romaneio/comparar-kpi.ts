// Compara dois detalhamentos do KPI NF por NF (spec do KPI ao vivo, criterio
// "mesmo resultado"): gerar a partir dos dados guardados tem que dar o MESMO
// que gerar a partir dos PDFs. Lista vazia = igual.
import type { LinhaDetalheEntrega } from './types'

const CAMPOS = ['status', 'observacao', 'chegada', 'saida', 'tempoParadaMin', 'motivo'] as const

export function compararDetalhes(a: LinhaDetalheEntrega[], b: LinhaDetalheEntrega[]): string[] {
  const chave = (x: LinhaDetalheEntrega) => `${x.carga}::${x.placa}::${x.nf}`
  const ma = new Map(a.map(x => [chave(x), x]))
  const mb = new Map(b.map(x => [chave(x), x]))
  const dif: string[] = []
  for (const [k, xa] of ma) {
    const xb = mb.get(k)
    if (!xb) { dif.push(`${k} só em A`); continue }
    for (const c of CAMPOS) {
      if ((xa[c] ?? null) !== (xb[c] ?? null)) dif.push(`${k} ${c}: ${xa[c]} ≠ ${xb[c]}`)
    }
  }
  for (const k of mb.keys()) if (!ma.has(k)) dif.push(`${k} só em B`)
  return dif
}
