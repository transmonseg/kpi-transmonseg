import type { LinhaParaKpi } from './gerador-kpi'

export type LinhaAgrupada = {
  loja_nome: string
  carro1: LinhaParaKpi | null
  carro2: LinhaParaKpi | null
  /** Bug I4: 3ª+ linha por loja era descartada silenciosamente. Agora preservada. */
  descartadas: LinhaParaKpi[]
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
  const map = new Map<string, LinhaParaKpi[]>()
  for (const l of linhas) {
    const arr = map.get(l.loja_nome) ?? []
    arr.push(l)
    map.set(l.loja_nome, arr)
  }
  const out: LinhaAgrupada[] = []
  // Tem rastreador = rodou de fato (tem saída do CD ou chegada na loja).
  const rodou = (l: LinhaParaKpi) => !!(l.saida_cd || l.chd_loja_1)
  for (const [loja_nome, arr] of map) {
    // Ordena (sort ESTÁVEL) e preenche os slots em sequência: 1º slot = maior
    // prioridade, 2º slot = seguinte, 3ª+ em `descartadas` (Bug I4 — não some).
    // Prioridade:
    //   1) quem RODOU (tem horário/rastreador) vem primeiro — o carro que
    //      entregou de fato ocupa o 1º carro; o sem rastreador cai pro 2º (que
    //      a operação filtra). Regra confirmada com o operador em 2026-05-31.
    //   2) desempate: dono (carro_ordem=1, 1ª entrega) antes de carona (=2).
    const ordenadas = [...arr].sort((a, b) => {
      const g = (rodou(b) ? 1 : 0) - (rodou(a) ? 1 : 0)
      if (g !== 0) return g
      return (a.carro_ordem ?? 1) - (b.carro_ordem ?? 1)
    })
    out.push({
      loja_nome,
      carro1: ordenadas[0] ?? null,
      carro2: ordenadas[1] ?? null,
      descartadas: ordenadas.slice(2),
    })
  }
  return out
}
