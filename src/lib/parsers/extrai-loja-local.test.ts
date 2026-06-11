import { describe, it, expect } from 'vitest'
import { extraiLojaLocal, temLojaLocal } from './extrai-loja-local'

describe('extraiLojaLocal — formato padrão (regressão)', () => {
  it('7000730 - PREZUNIC ICARAÍ', () => {
    expect(extraiLojaLocal('7000730 - PREZUNIC ICARAÍ')).toEqual({
      codigo_loja: '7000730',
      nome_loja: 'PREZUNIC ICARAÍ',
    })
  })

  it('9039124 - ZONA SUL BARRA', () => {
    expect(extraiLojaLocal('9039124 - ZONA SUL BARRA')).toEqual({
      codigo_loja: '9039124',
      nome_loja: 'ZONA SUL BARRA',
    })
  })

  it('código sem prefixo de rede + formato padrão ainda extrai', () => {
    const r = extraiLojaLocal('12345 - LOJA QUALQUER')
    expect(r.codigo_loja).toBe('12345')
    expect(r.nome_loja).toBe('LOJA QUALQUER')
  })
})

describe('extraiLojaLocal — formato com endereço interposto (bug confirmado)', () => {
  it('7000730 Niterói - RJ PREZUNIC ICARAÍ', () => {
    const r = extraiLojaLocal('7000730 Niterói - RJ PREZUNIC ICARAÍ')
    expect(r.codigo_loja).toBe('7000730')
    expect(r.nome_loja).toMatch(/PREZUNIC ICARAÍ/)
  })

  it('8590573 com endereço completo — PRINCESA ITABORAÍ', () => {
    const r = extraiLojaLocal(
      '8590573 26-40, NOVA CIDADE, ITABORAI, RJ, BRASIL, 50, 40, CEP 25665133 PRINCESA ITABORAÍ',
    )
    expect(r.codigo_loja).toBe('8590573')
    expect(r.nome_loja).toMatch(/PRINCESA ITABORAÍ/)
  })

  it('202006 com CEP — PAX MADUREIRA', () => {
    const r = extraiLojaLocal(
      '202006 Janeiro, Rio de Janeiro, Brasil, CEP 21351-900 PAX MADUREIRA',
    )
    expect(r.codigo_loja).toBe('202006')
    expect(r.nome_loja).toMatch(/PAX MADUREIRA/)
  })

  it('5353005 com cidade — ARMAZEM DO GRÃO (CAPELA)', () => {
    const r = extraiLojaLocal(
      '5353005 PETROPOLIS, RJ, BRASIL, 70, 60, CEP 25665133 ARMAZEM DO GRÃO (CAPELA)',
    )
    expect(r.codigo_loja).toBe('5353005')
    expect(r.nome_loja).toMatch(/ARMAZEM/)
  })
})

describe('extraiLojaLocal — não é loja', () => {
  it('BASE BENASSI retorna null', () => {
    expect(extraiLojaLocal('BASE BENASSI - BASE BENASSI')).toEqual({
      codigo_loja: null,
      nome_loja: null,
    })
  })

  it('FORA DE BASE retorna null', () => {
    expect(extraiLojaLocal('FORA DE BASE E LOCAL DE SERVIÇO')).toEqual({
      codigo_loja: null,
      nome_loja: null,
    })
  })

  it('código sem prefixo de rede + sem " - " retorna null', () => {
    // 12345 não tem prefixo de rede → não arrisca extrair
    const r = extraiLojaLocal('12345 Cidade RJ LUGAR QUALQUER')
    expect(r.codigo_loja).toBeNull()
  })

  it('ROTA genérica formato padrão retorna null (regressão dia 19)', () => {
    // 2018002 é geofence de bairro (ROTA BOTAFOGO), não loja física.
    // Sem este guard, paradas FORA_BASE viravam LOJA falsamente.
    expect(extraiLojaLocal('2018002 - ROTA BOTAFOGO')).toEqual({
      codigo_loja: null,
      nome_loja: null,
    })
  })

  it('ROTA genérica com endereço interposto retorna null', () => {
    expect(extraiLojaLocal('2020065 Rio de Janeiro - RJ ROTA ZONA NORTE').codigo_loja).toBeNull()
  })

  it('loja real com prefixo 202 continua extraindo (PAX não é ROTA)', () => {
    const r = extraiLojaLocal('202006 Janeiro, Rio de Janeiro, Brasil, CEP 21351-900 PAX MADUREIRA')
    expect(r.codigo_loja).toBe('202006')
  })

  it('modo strict: CEP no início do endereço NÃO vira código (regressão dia 19)', () => {
    // "21530-900, Brasil..." casa o formato "CÓDIGO - NOME" mas 21530 é CEP.
    // No fallback de local inteiro (exigePrefixoRede) deve ser rejeitado.
    const r = extraiLojaLocal('21530-900, Avenida Brasil, Coelho Neto BASE TEXTO', { exigePrefixoRede: true })
    expect(r.codigo_loja).toBeNull()
  })

  it('modo strict: prefixo de rede conhecido continua extraindo', () => {
    const r = extraiLojaLocal('7000730 - PREZUNIC ICARAÍ', { exigePrefixoRede: true })
    expect(r.codigo_loja).toBe('7000730')
  })
})

describe('temLojaLocal', () => {
  it('true para formato padrão', () =>
    expect(temLojaLocal('7000730 - PREZUNIC ICARAÍ')).toBe(true))

  it('true para formato com cidade-UF', () =>
    expect(temLojaLocal('7000730 Niterói - RJ PREZUNIC ICARAÍ')).toBe(true))

  it('true para formato com endereço completo', () =>
    expect(temLojaLocal('8590573 26-40, NOVA CIDADE, RJ, CEP 25665133 PRINCESA ITABORAÍ')).toBe(true))

  it('false para BASE BENASSI', () =>
    expect(temLojaLocal('BASE BENASSI - BASE BENASSI')).toBe(false))

  it('false para FORA DE BASE', () =>
    expect(temLojaLocal('FORA DE BASE E LOCAL DE SERVIÇO')).toBe(false))

  it('false para código sem prefixo + sem separador imediato', () =>
    expect(temLojaLocal('12345 cidade RJ LUGAR')).toBe(false))
})
