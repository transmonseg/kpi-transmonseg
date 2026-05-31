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
  for (const [loja_nome, arr] of map) {
    // Ordena por carro_ordem (1 = dono/1ª entrega vem antes de 2 = carona) com
    // sort ESTÁVEL (mantém a ordem original entre iguais), e preenche os slots
    // na sequência: 1º slot = maior prioridade, 2º slot = seguinte. A 3ª+ linha
    // fica em `descartadas` (Bug I4 — não some do sistema, vira warning).
    const ordenadas = [...arr].sort((a, b) => (a.carro_ordem ?? 1) - (b.carro_ordem ?? 1))
    out.push({
      loja_nome,
      carro1: ordenadas[0] ?? null,
      carro2: ordenadas[1] ?? null,
      descartadas: ordenadas.slice(2),
    })
  }
  return out
}
