import { describe, it, expect } from 'vitest'
import { aplicarOrdemRota, naOrdemIndices, viagemInvertida } from './ordem-rota'

const nf = (nf: string, chegada: string | null, situacao = 'entregue') => ({ nf, chegada, situacao })
const plano = (nf: string, ordem: number, romaneio = 'R1') => ({ nf, romaneio, ordem, previsaoInicio: `12/11/2026 0${ordem}:00:00` })

describe('naOrdemIndices', () => {
  it('maior sequência que respeita a ordem', () => {
    expect([...naOrdemIndices([1, 2, 3, 4])].sort()).toEqual([0, 1, 2, 3])
    expect(naOrdemIndices([1, 5, 2, 3, 4]).size).toBe(4) // o 5 foi feito cedo demais
    expect(naOrdemIndices([3, 2, 1]).size).toBe(1)
    expect(naOrdemIndices([2, 2, 3]).size).toBe(3) // empate não pune
    expect(naOrdemIndices([]).size).toBe(0)
  })
})

describe('aplicarOrdemRota', () => {
  const r = {
    calculadoEm: 'c1',
    placas: [
      { placa: 'AAA1A11', nfs: [nf('1', '08:00'), nf('2', '10:00'), nf('3', '09:00'), nf('4', '11:00'), nf('5', null, 'nao_foi')] },
      { placa: 'BBB2B22', nfs: [nf('9', '08:00')] },
    ],
  }
  const p = [plano('1', 1), plano('2', 2), plano('3', 3), plano('4', 4), plano('5', 5)]

  it('marca planejada x real por nota e resume por placa e no dia', () => {
    const o = aplicarOrdemRota(r, p, 'e1')
    const a = o.placas[0]
    // real: 1(08h) 3(09h) 2(10h) 4(11h) -> 3 de 4 na ordem
    expect(a.ordemRota).toEqual({ entregas: 4, naOrdem: 3, pct: 75 })
    const fora = a.nfs.filter(n => n.ordemRota && !n.ordemRota.naOrdem)
    expect(fora).toHaveLength(1)
    expect(a.nfs.find(n => n.nf === '1')!.ordemRota).toEqual({ planejada: 1, real: 1, naOrdem: true, romaneio: 'R1', previsao: '01:00' })
    expect(a.nfs.find(n => n.nf === '5')!.ordemRota).toBeUndefined() // não entregue não entra
    expect(o.placas[1].ordemRota).toBeUndefined() // sem plano
    expect(o.ordemRota).toEqual({ entregas: 4, naOrdem: 3, pct: 75 })
    expect(o.marca).toBe('c1#ordem-e1')
    expect(r.placas[0].nfs[0]).not.toHaveProperty('ordemRota') // não muta a entrada
  })

  it('cada romaneio (viagem) é contado separado', () => {
    const r2 = { calculadoEm: 'c', placas: [{ nfs: [nf('1', '08:00'), nf('2', '09:00'), nf('3', '10:00'), nf('4', '11:00')] }] }
    const o = aplicarOrdemRota(r2, [plano('1', 1, 'A'), plano('2', 2, 'A'), plano('3', 1, 'B'), plano('4', 2, 'B')])
    expect(o.placas[0].ordemRota).toEqual({ entregas: 4, naOrdem: 4, pct: 100 })
  })

  it('sem plano: devolve igual', () => {
    expect(aplicarOrdemRota(r, [])).toBe(r)
  })
})

describe('viagemInvertida', () => {
  it('rota feita de trás pra frente (RIQ4G11 12/11)', () => {
    expect(viagemInvertida([5, 4, 3, 2, 1])).toBe(true)
    expect(viagemInvertida([1, 2, 3, 4, 5])).toBe(false)
    expect(viagemInvertida([1, 5, 2, 4, 3])).toBe(false)
    expect(viagemInvertida([3, 2, 1])).toBe(false) // curta demais pra dizer
  })
  it('vai pro resumo da placa', () => {
    const r = { calculadoEm: 'c', placas: [{ nfs: ['1', '2', '3', '4'].map((nf, i) => ({ nf, chegada: `${String(8 + i).padStart(2, '0')}:00`, situacao: 'entregue' })) }] }
    const o = aplicarOrdemRota(r, ['4', '3', '2', '1'].map((nf, i) => ({ nf, romaneio: 'R', ordem: i + 1, previsaoInicio: null })))
    expect(o.placas[0].ordemRota).toEqual({ entregas: 4, naOrdem: 1, pct: 25, invertidas: 1 })
  })
})
