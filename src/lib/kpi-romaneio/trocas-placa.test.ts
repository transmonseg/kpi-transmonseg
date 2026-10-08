import { describe, it, expect } from 'vitest'
import { aplicarTrocasDePlaca, normalizarPlacaDigitada, completarPlaca, decidirTrocaManual } from './trocas-placa'

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

describe('completarPlaca (06/10: a operação escreve só o final, "5J17 vira 9C84")', () => {
  const frota = ['TTL5J17', 'RBJ9C84', 'RQU2H61', 'TTH2H61']
  it('placa inteira passa direto (com ou sem traço)', () => expect(completarPlaca('rbj-9c84', frota)).toEqual({ placa: 'RBJ9C84' }))
  it('só o final, único na frota: completa', () => {
    expect(completarPlaca('9c84', frota)).toEqual({ placa: 'RBJ9C84' })
    expect(completarPlaca('5J17', frota)).toEqual({ placa: 'TTL5J17' })
  })
  it('final repetido: pede a placa inteira, dizendo quais', () =>
    expect(completarPlaca('2H61', frota)).toEqual({ erro: 'Mais de uma placa termina em 2H61 (RQU2H61, TTH2H61). Digite a placa inteira.' }))
  it('final que não existe / texto inválido', () => {
    expect(completarPlaca('0000', frota)).toEqual({ erro: 'Nenhuma placa da frota termina em 0000.' })
    expect(completarPlaca('X', frota)).toEqual({ erro: 'Placa inválida.' })
  })
})

describe('troca mútua entre dois carros escalados (07/10, RQV5F67 x RBG4F53)', () => {
  it('cada carga vai pro outro carro, sem encadear', () => {
    const romaneio = [
      { carga: '99518', placa: 'RQV5F67', nf: 'a' },
      { carga: '99516', placa: 'RBG4F53', nf: 'b' },
    ]
    const escala = [
      { carga: '99518', placaRaw: 'RQV5F67', placaNorm: 'RQV5F67' },
      { carga: '99516', placaRaw: 'RBG4F53', placaNorm: 'RBG4F53' },
    ]
    const r = aplicarTrocasDePlaca(romaneio, escala, [
      { carga: '99518', placaEscala: 'RQV5F67', placaReal: 'RBG4F53' },
      { carga: '99516', placaEscala: 'RBG4F53', placaReal: 'RQV5F67' },
    ])
    expect(r.romaneio.map(l => l.placa)).toEqual(['RBG4F53', 'RQV5F67'])
    expect(r.escala.map(e => e.placaNorm)).toEqual(['RBG4F53', 'RQV5F67'])
  })
})

describe('decidirTrocaManual (campo "redirecionar carga", 08/10)', () => {
  it('carga sem troca: registra escala -> real', () => {
    expect(decidirTrocaManual(null, 'TTI9B98', 'rbi1j86')).toEqual({ acao: 'inserir', placaEscala: 'TTI9B98', placaReal: 'RBI1J86', moverNoMonitoramentoDe: 'TTI9B98' })
  })
  it('carga ja trocada: a escala continua a original, a placa real e a placa nova; o monitoramento sai da real anterior', () => {
    // a tela mostra a placa real (RBI1J86) como se fosse a da carga
    expect(decidirTrocaManual({ placaEscala: 'TTI9B98', placaReal: 'RBI1J86' }, 'RBI1J86', 'RBJ9C84'))
      .toEqual({ acao: 'atualizar', placaEscala: 'TTI9B98', placaReal: 'RBJ9C84', moverNoMonitoramentoDe: 'RBI1J86' })
  })
  it('voltar pra placa da escala desfaz a troca', () => {
    expect(decidirTrocaManual({ placaEscala: 'TTI9B98', placaReal: 'RBI1J86' }, 'RBI1J86', 'TTI9B98'))
      .toEqual({ acao: 'desfazer', placaEscala: 'TTI9B98', placaReal: 'TTI9B98', moverNoMonitoramentoDe: 'RBI1J86' })
  })
  it('mesma placa, sem troca registrada: invalido', () => {
    expect(decidirTrocaManual(null, 'TTI9B98', 'TTI9B98')).toEqual({ erro: 'A placa nova é a mesma da carga.' })
  })
  it('placa nova igual a que ja esta na troca: nada a fazer', () => {
    expect(decidirTrocaManual({ placaEscala: 'TTI9B98', placaReal: 'RBI1J86' }, 'RBI1J86', 'RBI1J86')).toEqual({ erro: 'A placa nova é a mesma da carga.' })
  })
})
