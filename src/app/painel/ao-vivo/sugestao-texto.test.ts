import { describe, it, expect } from 'vitest'
import { textoSugestao, corpoSugestao } from './sugestao-texto'

const base = { carga: 'PAO-6', placaEscala: '', placaSugerida: 'RQM4C16', enderecosVisitados: 6, enderecosDaCarga: 6 }

describe('textoSugestao', () => {
  it('carga sem placa (F1-03)', () => {
    expect(textoSugestao({ ...base, motivo: 'sem_placa', confirmadaAntes: 2 })).toBe('Carga PAO-6 veio sem placa; o RQM4C16 parou em 6 de 6 endereços (já confirmado em 2 dias).')
  })
  it('placa fora da frota, troca recorrente (F1-04)', () => {
    expect(textoSugestao({ ...base, carga: 'PAO-9', placaEscala: 'RQO5E38', placaSugerida: 'TOS5E38', enderecosVisitados: 3, enderecosDaCarga: 3, motivo: 'fora_da_frota', confirmadaAntes: 2, recorrente: true }))
      .toBe('Carga PAO-9: a placa RQO5E38 não existe na frota; o TOS5E38 parou em 3 de 3 endereços (troca recorrente: já confirmada em 2 dias).')
  })
  it('mútua (F1-02)', () => {
    expect(textoSugestao({ ...base, carga: '100206', placaEscala: 'RBI0J25', placaSugerida: 'TOS0G53', enderecosVisitados: 24, enderecosDaCarga: 27, modo: 'mutua', motivo: 'mutua' }))
      .toBe('Carga 100206: o RBI0J25 e o TOS0G53 trocaram as cargas entre si; o TOS0G53 parou em 24 de 27 endereços do RBI0J25.')
  })
  it('padrão (escalado não passou)', () => {
    expect(textoSugestao({ ...base, carga: '100102', placaEscala: 'RQV9E37', placaSugerida: 'RQV3G18', enderecosVisitados: 20, enderecosDaCarga: 25, motivo: 'livre' }))
      .toBe('Carga 100102: o RQV9E37 da escala não passou nos clientes; o RQV3G18 parou em 20 de 25 endereços.')
  })
})

describe('corpoSugestao', () => {
  it('redirecionar (inclusive sem placa) com a data', () => {
    expect(corpoSugestao({ ...base, modo: 'redirecionar' }, '2026-10-22')).toEqual({ modo: 'redirecionar', data: '2026-10-22', carga: 'PAO-6', placaEscala: '', placaReal: 'RQM4C16' })
  })
  it('placa digitada no lugar da sugerida', () => {
    expect(corpoSugestao({ ...base }, undefined, 'tos5e38')).toEqual({ modo: 'redirecionar', carga: 'PAO-6', placaEscala: '', placaReal: 'tos5e38' })
  })
  it('mútua: placa inteira A<->B', () => {
    expect(corpoSugestao({ ...base, carga: '100206', placaEscala: 'RBI0J25', placaSugerida: 'TOS0G53', modo: 'mutua' }, '2026-10-16'))
      .toEqual({ modo: 'mutua', data: '2026-10-16', placaEscala: 'RBI0J25', placaB: 'TOS0G53' })
  })
})
