import { describe, it, expect } from 'vitest'
import { conviteExpirado, empresaValida, empresaLiberada, type Perfil } from './perfil'

describe('conviteExpirado', () => {
  it('null (nunca expira) → false', () => {
    expect(conviteExpirado(null)).toBe(false)
  })

  it('data no passado → true', () => {
    expect(conviteExpirado('2020-01-01T00:00:00.000Z')).toBe(true)
  })

  it('data no futuro → false', () => {
    expect(conviteExpirado('2999-01-01T00:00:00.000Z')).toBe(false)
  })
})

describe('empresaValida', () => {
  it('empresa conhecida → true', () => {
    expect(empresaValida('benassi')).toBe(true)
    expect(empresaValida('nutrimax')).toBe(true)
    expect(empresaValida('portefrio')).toBe(true)
  })

  it('empresa desconhecida → false', () => {
    expect(empresaValida('inexistente')).toBe(false)
  })
})

describe('empresaLiberada', () => {
  it('admin sempre liberado, mesmo sem a empresa na lista', () => {
    const perfil: Perfil = { papel: 'admin', redes: [], meses: [], empresas: [] }
    expect(empresaLiberada(perfil, 'nutrimax')).toBe(true)
  })

  it('visualizador com a empresa na lista → liberado', () => {
    const perfil: Perfil = { papel: 'visualizador', redes: [], meses: [], empresas: ['nutrimax'] }
    expect(empresaLiberada(perfil, 'nutrimax')).toBe(true)
  })

  it('visualizador sem a empresa na lista → bloqueado', () => {
    const perfil: Perfil = { papel: 'visualizador', redes: [], meses: [], empresas: ['nutrimax'] }
    expect(empresaLiberada(perfil, 'benassi')).toBe(false)
  })
})
