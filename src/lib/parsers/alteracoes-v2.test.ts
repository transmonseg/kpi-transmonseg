import { describe, it, expect } from 'vitest'
import { normalizaNomeMotorista } from './alteracoes-v2'

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
