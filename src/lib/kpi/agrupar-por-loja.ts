import type { LinhaParaKpi } from './gerador-kpi'

export type LinhaAgrupada = {
  loja_nome: string
  carro1: LinhaParaKpi | null
  carro2: LinhaParaKpi | null
}

/**
 * Agrupa linhas pela `loja_nome`, distribuindo entre slots `carro1` e `carro2`.
 *
 * Regra base: respeita `carro_ordem` (1 → carro1, 2 → carro2).
 *
 * Bug-5 (dia 19): quando duas linhas da mesma loja chegam com `carro_ordem`
 * IDÊNTICO (ex: parser ZS hardcoda `carro_ordem=1` em multi-trip, ou parser
 * CARREFOUR detecta dois 2º carros), a regra ingênua sobrescreve o slot e a
 * segunda linha some do KPI. Fix: quando o slot preferido já está ocupado,
 * cai pro slot oposto vazio. Se ambos estiverem cheios, a 3ª+ linha é
 * descartada (cenário raro — KPI só tem 2 colunas de carro).
 */
export function agruparPorLoja(linhas: LinhaParaKpi[]): LinhaAgrupada[] {
  const map = new Map<string, LinhaAgrupada>()
  for (const l of linhas) {
    const entry = map.get(l.loja_nome) ?? { loja_nome: l.loja_nome, carro1: null, carro2: null }
    const preferred = l.carro_ordem === 1 ? 'carro1' : 'carro2'
    const fallback = preferred === 'carro1' ? 'carro2' : 'carro1'
    if (entry[preferred] === null) {
      entry[preferred] = l
    } else if (entry[fallback] === null) {
      entry[fallback] = l
    }
    // Else: ambos slots ocupados — descarta (KPI só tem 2 carros). Cenário raro:
    // 3+ linhas mesma loja mesmo dia. Primeira-2 são as preservadas.
    map.set(l.loja_nome, entry)
  }
  return [...map.values()]
}
