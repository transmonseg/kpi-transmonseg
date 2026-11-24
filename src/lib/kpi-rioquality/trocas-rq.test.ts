import { describe, it, expect } from 'vitest'
import { aplicarTrocasRQ, linhasTrocaRQ } from './trocas-rq'
import type { EntregaRioQualityCompleta } from './parse-planilhas'

const e = (placa: string, romaneio: string, nf: string, cliente = 'C' + nf): EntregaRioQualityCompleta =>
  ({ placaNorm: placa, romaneio, nf, clienteNome: cliente, cidade: 'RIO', uf: 'RJ', destino: '', motorista: '', rua: 'R ' + nf, bairro: 'B' } as EntregaRioQualityCompleta)

describe('trocas da Rio Quality', () => {
  const dia = [e('AAA1A11', '100', '1'), e('AAA1A11', '100', '2'), e('BBB2B22', '200', '3')]
  it('troca pelo romaneio só move aquele romaneio', () => {
    const r = aplicarTrocasRQ(dia, [{ carga: '100', placaEscala: 'AAA1A11', placaReal: 'CCC3C33' }])
    expect(r.map(x => x.placaNorm)).toEqual(['CCC3C33', 'CCC3C33', 'BBB2B22'])
  })
  it('troca da placa inteira (sem romaneio)', () => {
    const r = aplicarTrocasRQ(dia, [{ carga: null, placaEscala: 'BBB2B22', placaReal: 'DDD4D44' }])
    expect(r.map(x => x.placaNorm)).toEqual(['AAA1A11', 'AAA1A11', 'DDD4D44'])
  })
  it('sem troca devolve as mesmas entregas', () => {
    expect(aplicarTrocasRQ(dia, [])).toBe(dia)
  })
  it('NF repetida ganha sufixo como no monitoramento', () => {
    const l = linhasTrocaRQ([e('AAA1A11', '100', '9', 'X'), e('AAA1A11', '100', '9', 'Y')])
    expect(l.map(x => x.nf)).toEqual(['9', '9-2'])
    expect(l[0].carga).toBe('100')
  })
})
