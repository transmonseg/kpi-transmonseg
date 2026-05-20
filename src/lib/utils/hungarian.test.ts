import { describe, it, expect } from 'vitest'
import { hungarianMin, bruteForceMin } from './hungarian'

function totalOf(cost: number[][], assignment: number[]): number {
  let total = 0
  for (let i = 0; i < assignment.length; i++) {
    const j = assignment[i]
    if (j >= 0 && Number.isFinite(cost[i][j])) total += cost[i][j]
  }
  return total
}

describe('hungarianMin', () => {
  it('caso 2x2 simples — escolhe a permutação de menor custo total', () => {
    const cost = [
      [4, 1],
      [2, 0],
    ]
    // Permutações: [0,1]=4+0=4 vs [1,0]=1+2=3 → ótimo é [1,0] com total 3
    const r = hungarianMin(cost)
    expect(totalOf(cost, r)).toBe(3)
    expect(r).toEqual([1, 0])
  })

  it('caso 3x3 com optimal não-greedy', () => {
    // Greedy pegaria (0,0)=1, depois (1,1)=4, depois (2,2)=8 → total 13
    // Optimal é (0,1)=2, (1,2)=5, (2,0)=6 → total 13 também
    // Caso mais discriminador:
    const cost = [
      [9, 1, 10],
      [5, 4, 1],
      [1, 10, 9],
    ]
    // Greedy pegando menor por linha: (0,1)=1, (1,2)=1, (2,0)=1 → total 3
    // Hungarian deve achar o mesmo
    const r = hungarianMin(cost)
    expect(totalOf(cost, r)).toBe(3)
  })

  it('matriz retangular — mais linhas que colunas', () => {
    // 3 linhas, 2 colunas → 1 linha fica sem match
    const cost = [
      [1, 5],
      [3, 2],
      [9, 8],
    ]
    const r = hungarianMin(cost)
    // Melhor: linha 0 → col 0 (1), linha 1 → col 1 (2). Linha 2 → -1
    expect(r).toHaveLength(3)
    const valid = r.filter(j => j >= 0)
    expect(valid).toHaveLength(2)
    expect(totalOf(cost, r)).toBe(3)
  })

  it('matriz retangular — mais colunas que linhas', () => {
    const cost = [
      [5, 1, 9],
      [3, 6, 2],
    ]
    const r = hungarianMin(cost)
    expect(r).toHaveLength(2)
    expect(r.every(j => j >= 0)).toBe(true)
    expect(totalOf(cost, r)).toBe(3)  // (0,1)=1, (1,2)=2
  })

  it('Infinity nas células — não escolhe pares impossíveis', () => {
    const cost = [
      [Infinity, 1, Infinity],
      [2, Infinity, 3],
      [Infinity, Infinity, 5],
    ]
    const r = hungarianMin(cost)
    expect(r).toEqual([1, 0, 2])
    expect(totalOf(cost, r)).toBe(1 + 2 + 5)
  })

  it('linha completamente impossível — fica sem match', () => {
    const cost = [
      [1, 2],
      [Infinity, Infinity],
    ]
    const r = hungarianMin(cost)
    expect(r[1]).toBe(-1)
    // Linha 0 deve ter match (col 0 ou 1)
    expect(r[0]).toBeGreaterThanOrEqual(0)
  })

  it('concorda com brute-force em casos n=4', () => {
    const cost = [
      [4, 5, 3, 7],
      [8, 2, 9, 1],
      [6, 4, 2, 8],
      [3, 7, 5, 4],
    ]
    const h = hungarianMin(cost)
    const bf = bruteForceMin(cost)
    expect(totalOf(cost, h)).toBe(bf.total)
  })

  it('concorda com brute-force em casos n=5 retangular', () => {
    const cost = [
      [7, 3, 9, 2, 5],
      [6, 1, 4, 8, 3],
      [5, 9, 2, 7, 6],
      [2, 8, 5, 1, 9],
    ]
    const h = hungarianMin(cost)
    const bf = bruteForceMin(cost)
    expect(totalOf(cost, h)).toBe(bf.total)
  })

  it('estresse n=8 com custos aleatórios — concorda com brute-force', () => {
    // n=8 brute-force = 8! = 40320 permutações, ainda factível
    const cost: number[][] = []
    let seed = 42
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    for (let i = 0; i < 8; i++) {
      cost.push(Array.from({ length: 8 }, () => Math.floor(rand() * 100)))
    }
    const h = hungarianMin(cost)
    const bf = bruteForceMin(cost)
    expect(totalOf(cost, h)).toBe(bf.total)
  })

  it('caso degenerado — matriz vazia', () => {
    expect(hungarianMin([])).toEqual([])
    expect(hungarianMin([[]])).toEqual([-1])
  })

  it('caso degenerado — 1x1', () => {
    expect(hungarianMin([[5]])).toEqual([0])
    expect(hungarianMin([[Infinity]])).toEqual([-1])
  })
})
