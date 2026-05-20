import { describe, it, expect } from 'vitest'
import { normalizaNomeMotorista, normalizaTexto } from './alteracoes-v2'

describe('normalizaNomeMotorista', () => {
  it('upper + remove acentos + colapsa espaços', () => {
    expect(normalizaNomeMotorista('José  Roberto')).toBe('JOSE ROBERTO')
    expect(normalizaNomeMotorista('Antônio')).toBe('ANTONIO')
    expect(normalizaNomeMotorista('  felipe   silva  ')).toBe('FELIPE SILVA')
  })

  it('retorna string vazia para entrada vazia', () => {
    expect(normalizaNomeMotorista('')).toBe('')
    expect(normalizaNomeMotorista(null as unknown as string)).toBe('')
  })
})

describe('normalizaTexto', () => {
  it('remove emojis', () => {
    expect(normalizaTexto('🚨ALTERAÇÃO 🚨')).toBe('ALTERAÇÃO')
  })

  it('padroniza quebras de linha', () => {
    expect(normalizaTexto('linha1\r\nlinha2\rlinha3')).toBe('linha1\nlinha2\nlinha3')
  })

  it('insere quebra antes de "Filial N"', () => {
    expect(normalizaTexto('Filial 43 Sai: X Filial 23 Entra: Y')).toBe(
      'Filial 43 Sai: X\nFilial 23 Entra: Y',
    )
  })

  it('colapsa espaços múltiplos preservando quebras', () => {
    expect(normalizaTexto('a   b\n   c    d')).toBe('a b\nc d')
  })
})
