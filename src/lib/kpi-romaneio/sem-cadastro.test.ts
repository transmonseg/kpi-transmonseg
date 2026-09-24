import { describe, it, expect } from 'vitest'
import { semCadastroUnitrac, nfsSoUnitrac } from './sem-cadastro'
import type { AlvoApi } from '@/lib/unitrac-api'

const alvo = (o: Partial<AlvoApi>) => ({ placaNorm: 'AAA1A11', documento: '1', situacao: 1, ...o }) as AlvoApi

describe('semCadastroUnitrac', () => {
  it('liga so com 1/true', () => {
    expect(semCadastroUnitrac({ SEM_CADASTRO_UNITRAC: '1' })).toBe(true)
    expect(semCadastroUnitrac({ SEM_CADASTRO_UNITRAC: 'true' })).toBe(true)
    expect(semCadastroUnitrac({})).toBe(false)
    expect(semCadastroUnitrac({ SEM_CADASTRO_UNITRAC: '0' })).toBe(false)
  })
})

describe('nfsSoUnitrac', () => {
  it('lista feitos na Unitrac sem visita GPS; ignora pendentes e os com visita', () => {
    const visitas = new Map([['AAA1A11', new Map([['2', {}]])]])
    const r = nfsSoUnitrac([alvo({ documento: '1' }), alvo({ documento: '2' }), alvo({ documento: '3', situacao: 0 })], visitas)
    expect(r).toEqual(['1'])
  })
})
