import { describe, it, expect } from 'vitest'
import { parseAlteracaoTextoLivre } from './alteracao-texto-livre'
import type { ParseContext } from './alteracoes-v2.types'

const ctx: ParseContext = {
  associacoes: [],
  lojas: [
    { rede_id: 'PREZUNIC', nome: 'Prezunic - Barra da Tijuca', nome_norm: 'PREZUNIC BARRA DA TIJUCA', codigo_escala: null },
    { rede_id: 'ASSAI', nome: 'Assaí - Maracanã - Loja 286', nome_norm: 'ASSAI MARACANA LOJA 286', codigo_escala: '286' },
  ],
}

describe('parseAlteracaoTextoLivre', () => {
  it('extrai loja + placa + motorista de uma frase solta', () => {
    const r = parseAlteracaoTextoLivre('na Prezunic Barra hoje vai o Simão placa LSN-6172', ctx)
    expect(r).toHaveLength(1)
    expect(r[0].rede_id).toBe('PREZUNIC')
    expect(r[0].loja_nome_raw).toBe('Prezunic - Barra da Tijuca')
    expect(r[0].entra?.placa_norm).toBe('LSN6172')
    expect(r[0].entra?.motorista_nome?.toUpperCase()).toContain('SIMÃO')
    expect(r[0].confianca).toBe('alta')
  })

  it('pega VÁRIAS alterações de um paste com várias linhas', () => {
    const txt = 'Prezunic Barra: João LSN-6172\nAssaí Maracanã 286 Pedro ABC-1D23'
    const r = parseAlteracaoTextoLivre(txt, ctx)
    expect(r).toHaveLength(2)
    expect(r.map(a => a.entra?.placa_norm).sort()).toEqual(['ABC1D23', 'LSN6172'])
  })

  it('entende texto grudado/sem rótulo "placa"', () => {
    const r = parseAlteracaoTextoLivre('Prezunic Barra da Tijuca Carlos LSN-6172', ctx)
    expect(r).toHaveLength(1)
    expect(r[0].rede_id).toBe('PREZUNIC')
    expect(r[0].entra?.placa_norm).toBe('LSN6172')
    expect(r[0].entra?.motorista_nome?.toUpperCase()).toContain('CARLOS')
  })

  it('confiança média quando acha placa mas NÃO acha a loja', () => {
    const r = parseAlteracaoTextoLivre('motorista novo ABC-1D23 numa loja desconhecida', ctx)
    expect(r).toHaveLength(1)
    expect(r[0].loja_nome_raw).toBeNull()
    expect(r[0].confianca).toBe('media')
  })

  it('não inventa alteração quando não há placa', () => {
    expect(parseAlteracaoTextoLivre('mensagem qualquer sem placa nenhuma', ctx)).toHaveLength(0)
  })

  it('pega o código quando vem junto', () => {
    const r = parseAlteracaoTextoLivre('Assaí Maracanã motorista Pedro 286 placa ABC-1D23', ctx)
    expect(r[0].entra?.motorista_codigo).toBe(286)
  })
})
