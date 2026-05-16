import type { LinhaParaKpi } from './gerador-kpi'

export type LinhaAgrupada = {
  loja_nome: string
  carro1: LinhaParaKpi | null
  carro2: LinhaParaKpi | null
}

export function agruparPorLoja(linhas: LinhaParaKpi[]): LinhaAgrupada[] {
  const map = new Map<string, LinhaAgrupada>()
  for (const l of linhas) {
    const entry = map.get(l.loja_nome) ?? { loja_nome: l.loja_nome, carro1: null, carro2: null }
    if (l.carro_ordem === 1) entry.carro1 = l
    else entry.carro2 = l
    map.set(l.loja_nome, entry)
  }
  return [...map.values()]
}
