import { describe, it, expect } from 'vitest'
import { classificarPlacaViaApi } from './classificar-placa'

const pos = (datagps: string, atraso = 0) => ({ cv: '1', velocidade: 0, ignicao: false, datagps, atraso })

describe('classificarPlacaViaApi', () => {
  const data = '2026-06-16'
  it('não está na frota da API → sem_rastreador', () => {
    expect(classificarPlacaViaApi('ABC1D23', new Set(), {}, data)).toBe('sem_rastreador')
  })
  it('na frota + transmitiu hoje → rastreado', () => {
    const frota = new Set(['ABC1D23'])
    expect(classificarPlacaViaApi('ABC1D23', frota, { ABC1D23: pos('16/06/2026 08:10:00') }, data)).toBe('rastreado')
  })
  it('na frota + último GPS de outro dia → desatualizado', () => {
    const frota = new Set(['ABC1D23'])
    expect(classificarPlacaViaApi('ABC1D23', frota, { ABC1D23: pos('10/06/2026 08:10:00') }, data)).toBe('desatualizado')
  })
  it('na frota + sem posição nenhuma → desatualizado (não transmite)', () => {
    expect(classificarPlacaViaApi('ABC1D23', new Set(['ABC1D23']), {}, data)).toBe('desatualizado')
  })
  it('usa variantes Mercosul/OCR pra achar na frota', () => {
    // placa antiga na escala (FTV6542), Mercosul na frota (FTV6F42)
    const frota = new Set(['FTV6F42'])
    expect(classificarPlacaViaApi('FTV6542', frota, { FTV6F42: pos('16/06/2026 08:00:00') }, data)).toBe('rastreado')
  })
})
