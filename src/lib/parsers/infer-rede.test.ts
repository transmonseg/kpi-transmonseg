import { describe, it, expect } from 'vitest'
import { inferRedeFromLoja } from './infer-rede'

describe('inferRedeFromLoja', () => {
  it('Assaí - Ceasa - Loja 42 → ASSAI', () =>
    expect(inferRedeFromLoja('Assaí - Ceasa - Loja 42')).toBe('ASSAI'))

  it('Prezunic - Icaraí → PREZUNIC', () =>
    expect(inferRedeFromLoja('Prezunic - Icaraí')).toBe('PREZUNIC'))

  it('Princesa - Itaboraí (2ª Entrega) → PRINCESA', () =>
    expect(inferRedeFromLoja('Princesa - Itaboraí (2ª Entrega)')).toBe('PRINCESA'))

  it('Super Prix - Icaraí - Loja 10 → SUPERPRIX', () =>
    expect(inferRedeFromLoja('Super Prix - Icaraí - Loja 10')).toBe('SUPERPRIX'))

  it('Guanabara - Madureira → GUANABARA', () =>
    expect(inferRedeFromLoja('Guanabara - Madureira')).toBe('GUANABARA'))

  it('Armazém do Grão - Petrópolis → ARMAZEM_GRAO', () =>
    expect(inferRedeFromLoja('Armazém do Grão - Petrópolis')).toBe('ARMAZEM_GRAO'))

  it('Atacadão Belford Roxo → ATACADAO', () =>
    expect(inferRedeFromLoja('Atacadão Belford Roxo')).toBe('ATACADAO'))

  it('Zona Sul Loja 21 - Flamengo → ZONA_SUL', () =>
    expect(inferRedeFromLoja('Zona Sul Loja 21 - Flamengo')).toBe('ZONA_SUL'))

  it('loja desconhecida → DESCONHECIDO', () =>
    expect(inferRedeFromLoja('Empório Barra Tower')).toBe('DESCONHECIDO'))

  it('string vazia → DESCONHECIDO', () =>
    expect(inferRedeFromLoja('')).toBe('DESCONHECIDO'))
})
