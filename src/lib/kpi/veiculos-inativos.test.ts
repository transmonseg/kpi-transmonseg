import { describe, it, expect } from 'vitest'
import { isVeiculoInativo, VEICULOS_INATIVOS } from './veiculos-inativos'

describe('U2 — isVeiculoInativo normalizado (sem hifen)', () => {
  it('aceita placa formato Unitrac (sem hifen)', () => {
    expect(isVeiculoInativo('ALS4H33')).toBe(true)
    expect(isVeiculoInativo('AMW4D50')).toBe(true)
    expect(isVeiculoInativo('EZU9J51')).toBe(true)
    expect(isVeiculoInativo('UBF5G36')).toBe(true)
  })

  it('continua aceitando formato com hifen (legado/manual)', () => {
    expect(isVeiculoInativo('ALS-4H33')).toBe(true)
    expect(isVeiculoInativo('EZU-9J51')).toBe(true)
  })

  it('rejeita placa NAO listada', () => {
    expect(isVeiculoInativo('XYZ9999')).toBe(false)
    expect(isVeiculoInativo('ABC-1234')).toBe(false)
  })

  it('null/undefined retornam false', () => {
    expect(isVeiculoInativo(null)).toBe(false)
    expect(isVeiculoInativo(undefined)).toBe(false)
    expect(isVeiculoInativo('')).toBe(false)
  })

  it('Set VEICULOS_INATIVOS contem todas as 31 placas sem hifen', () => {
    expect(VEICULOS_INATIVOS.size).toBe(31)
    expect(VEICULOS_INATIVOS.has('ALS4H33')).toBe(true)
    expect(VEICULOS_INATIVOS.has('ALS-4H33')).toBe(false)
  })
})
