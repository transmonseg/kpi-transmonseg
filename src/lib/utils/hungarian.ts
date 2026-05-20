// Hungarian algorithm (Jonker-Volgenant variant) — O(n³) optimal assignment
// for a bipartite matching problem.
//
// Pra `cost: number[n][m]`, retorna `assignment: number[n]` onde
// `assignment[i] = j` significa "linha i pareada com coluna j", `-1` se sem
// match. Minimiza a soma total das células escolhidas.
//
// Aceita custos `Infinity` (não pareável) — internamente convertido para uma
// constante grande pra manter as operações numéricas estáveis. O algoritmo
// funciona com matriz retangular (n ≠ m) — pad com Infinity até virar quadrada.
//
// Usado pelo matcher do KPI quando uma placa tem 6+ paradas a parear contra
// 6+ linhas da escala. Pra n ≤ 5 o matcher mantém brute-force (determinístico
// e mais simples de auditar).

export function hungarianMin(cost: number[][]): number[] {
  const n = cost.length
  const m = cost[0]?.length ?? 0
  if (n === 0 || m === 0) return new Array(n).fill(-1)

  // Padding para matriz quadrada e substituição de Infinity por valor grande
  const dim = Math.max(n, m)
  const LARGE = 1e15
  const c: number[][] = Array.from({ length: dim }, (_, i) =>
    Array.from({ length: dim }, (_, j) => {
      if (i >= n || j >= m) return LARGE
      const v = cost[i][j]
      return Number.isFinite(v) ? v : LARGE
    }),
  )

  // 1-indexed pra simplificar a tradução do algoritmo clássico
  const u = new Array<number>(dim + 1).fill(0)
  const v = new Array<number>(dim + 1).fill(0)
  const p = new Array<number>(dim + 1).fill(0)
  const way = new Array<number>(dim + 1).fill(0)

  for (let i = 1; i <= dim; i++) {
    p[0] = i
    let j0 = 0
    const minv = new Array<number>(dim + 1).fill(Infinity)
    const used = new Array<boolean>(dim + 1).fill(false)

    do {
      used[j0] = true
      const i0 = p[j0]
      let delta = Infinity
      let j1 = -1

      for (let j = 1; j <= dim; j++) {
        if (used[j]) continue
        const cur = c[i0 - 1][j - 1] - u[i0] - v[j]
        if (cur < minv[j]) {
          minv[j] = cur
          way[j] = j0
        }
        if (minv[j] < delta) {
          delta = minv[j]
          j1 = j
        }
      }

      for (let j = 0; j <= dim; j++) {
        if (used[j]) {
          u[p[j]] += delta
          v[j] -= delta
        } else {
          minv[j] -= delta
        }
      }

      j0 = j1
    } while (p[j0] !== 0)

    do {
      const j1 = way[j0]
      p[j0] = p[j1]
      j0 = j1
    } while (j0 !== 0)
  }

  // Reconstrói assignment do espaço original (descartando padding e LARGE)
  const result = new Array<number>(n).fill(-1)
  for (let j = 1; j <= dim; j++) {
    const i = p[j] - 1
    const col = j - 1
    if (i >= 0 && i < n && col < m && Number.isFinite(cost[i][col])) {
      result[i] = col
    }
  }
  return result
}

/**
 * Brute-force optimal assignment — só pra n ≤ 5, usado como oráculo
 * em testes pra validar que o Hungarian produz mesmo total mínimo.
 */
export function bruteForceMin(cost: number[][]): { assignment: number[]; total: number } {
  const n = cost.length
  const m = cost[0]?.length ?? 0
  if (n === 0 || m === 0) return { assignment: new Array(n).fill(-1), total: 0 }

  const k = Math.min(n, m)
  let bestTotal = Infinity
  let bestAssign = new Array<number>(n).fill(-1)

  const used = new Set<number>()
  const cur = new Array<number>(n).fill(-1)

  function dfs(li: number, runningTotal: number) {
    if (runningTotal >= bestTotal) return  // poda
    if (li === k) {
      if (runningTotal < bestTotal) {
        bestTotal = runningTotal
        bestAssign = [...cur]
      }
      return
    }
    for (let pi = 0; pi < m; pi++) {
      if (used.has(pi)) continue
      const v = cost[li][pi]
      if (!Number.isFinite(v)) continue
      used.add(pi)
      cur[li] = pi
      dfs(li + 1, runningTotal + v)
      cur[li] = -1
      used.delete(pi)
    }
  }
  dfs(0, 0)

  return { assignment: bestAssign, total: bestTotal === Infinity ? 0 : bestTotal }
}
