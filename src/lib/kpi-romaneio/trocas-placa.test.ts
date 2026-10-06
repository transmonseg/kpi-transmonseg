import { describe, it, expect } from 'vitest'
import { aplicarTrocasDePlaca, normalizarPlacaDigitada } from './trocas-placa'

const rom = (carga: string, placa: string, nf: string) => ({ carga, placa, nf })
const esc = (carga: string, placa: string) => ({ carga, placaRaw: placa, placaNorm: placa.replace('-', '') })

describe('aplicarTrocasDePlaca', () => {
  it('sem carga: troca a placa em todas as linhas daquela placa (romaneio e escala)', () => {
    const r = aplicarTrocasDePlaca(
      [rom('1', 'RBG-4F53', 'a'), rom('1', 'RBG-4F53', 'b'), rom('2', 'RQV-5F67', 'c')],
      [esc('1', 'RBG-4F53'), esc('2', 'RQV-5F67')],
      [{ carga: null, placaEscala: 'RBG4F53', placaReal: 'RQV5F67' }],
    )
    expect(r.romaneio.map(l => l.placa)).toEqual(['RQV5F67', 'RQV5F67', 'RQV-5F67'])
    expect(r.escala[0]).toMatchObject({ placaRaw: 'RQV5F67', placaNorm: 'RQV5F67' })
    expect(r.aplicadas).toBe(2)
  })

  it('com carga: só aquela carga', () => {
    const r = aplicarTrocasDePlaca(
      [rom('1', 'AAA1A11', 'a'), rom('2', 'AAA1A11', 'b')],
      [esc('1', 'AAA1A11'), esc('2', 'AAA1A11')],
      [{ carga: '2', placaEscala: 'AAA1A11', placaReal: 'BBB2B22' }],
    )
    expect(r.romaneio.map(l => l.placa)).toEqual(['AAA1A11', 'BBB2B22'])
    expect(r.escala.map(e => e.placaNorm)).toEqual(['AAA1A11', 'BBB2B22'])
  })

  it('placa que não está no dia: nada muda', () => {
    const romaneio = [rom('1', 'AAA1A11', 'a')]
    const r = aplicarTrocasDePlaca(romaneio, [], [{ carga: null, placaEscala: 'ZZZ9Z99', placaReal: 'BBB2B22' }])
    expect(r.aplicadas).toBe(0)
    expect(r.romaneio).toEqual(romaneio)
  })

  it('duas trocas pra mesma placa: a última vence', () => {
    const r = aplicarTrocasDePlaca([rom('1', 'AAA1A11', 'a')], [], [
      { carga: null, placaEscala: 'AAA1A11', placaReal: 'BBB2B22' },
      { carga: null, placaEscala: 'AAA1A11', placaReal: 'CCC3C33' },
    ])
    expect(r.romaneio[0].placa).toBe('CCC3C33')
  })
})

describe('carga sem placa no romaneio (pão 05/10)', () => {
  it('troca com placa da escala vazia e carga: põe a placa só naquela carga', () => {
    const r = aplicarTrocasDePlaca([rom('PAO-9', '', '1'), rom('PAO-11', '', '2')], [], [{ carga: 'PAO-9', placaEscala: '', placaReal: 'TOS1H26' }])
    expect(r.romaneio.map(l => l.placa)).toEqual(['TOS1H26', ''])
    expect(r.aplicadas).toBe(1)
  })
})

describe('normalizarPlacaDigitada', () => {
  it('tira hífen/espaço e põe maiúscula', () => {
    expect(normalizarPlacaDigitada(' rqv-5f67 ')).toBe('RQV5F67')
  })
})
