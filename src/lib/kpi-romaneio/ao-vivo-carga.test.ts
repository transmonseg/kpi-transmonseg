import { describe, expect, it } from 'vitest'
import { juntarEstado, mensagemFalhaCarga, semResultadoSeIgual } from './ao-vivo-carga'

type R = { calculadoEm: string; placas: number[] } | null
const res = (calculadoEm: string): R => ({ calculadoEm, placas: [1, 2, 3] })

describe('semResultadoSeIgual', () => {
  it('tira o resultado quando a tela já tem o mesmo cálculo', () => {
    const e = semResultadoSeIgual({ dia: 1, resultado: res('10:00') }, '10:00')
    expect(e.resultado).toBeNull()
    expect(e.resultadoInalterado).toBe(true)
    expect(e.dia).toBe(1)
  })
  it('manda o resultado quando o cálculo mudou ou a tela não tem nenhum', () => {
    expect(semResultadoSeIgual({ resultado: res('10:10') }, '10:00').resultado?.calculadoEm).toBe('10:10')
    expect(semResultadoSeIgual({ resultado: res('10:10') }, null).resultado?.calculadoEm).toBe('10:10')
  })
  it('sem resultado no servidor não marca inalterado', () => {
    expect(semResultadoSeIgual({ resultado: null }, '10:00').resultadoInalterado).toBeUndefined()
  })
})

describe('juntarEstado', () => {
  it('inalterado reaproveita o resultado anterior e atualiza o resto', () => {
    const ant: { dia: number; resultado: R } = { dia: 1, resultado: res('10:00') }
    const j = juntarEstado(ant, { dia: 2, resultado: null, resultadoInalterado: true })
    expect(j.resultado).toBe(ant.resultado)
    expect(j.dia).toBe(2)
    expect('resultadoInalterado' in j).toBe(false)
  })
  it('resposta completa substitui', () => {
    expect(juntarEstado({ resultado: res('10:00') }, { resultado: res('10:10') }).resultado?.calculadoEm).toBe('10:10')
  })
  it('inalterado sem dado anterior fica sem resultado (próxima busca traz tudo)', () => {
    expect(juntarEstado(null, { resultado: null, resultadoInalterado: true }).resultado).toBeNull()
  })
})

describe('mensagemFalhaCarga', () => {
  it('erro de rede vira texto claro', () => {
    expect(mensagemFalhaCarga(new TypeError('Failed to fetch'), true)).toMatch(/últimos dados/)
    expect(mensagemFalhaCarga(new TypeError('Failed to fetch'), false)).toMatch(/Tentando de novo/)
  })
  it('erro do servidor mantém a mensagem', () => {
    expect(mensagemFalhaCarga(new Error('Data inválida.'), true)).toBe('Data inválida.')
  })
})
