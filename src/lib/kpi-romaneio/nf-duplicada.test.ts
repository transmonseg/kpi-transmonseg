import { describe, it, expect, vi } from 'vitest'
import { logarNfDuplicadaNaMesmaPlaca } from './nf-duplicada'
import type { LinhaGeocodificada } from './types'

function linha(over: Partial<LinhaGeocodificada> = {}): LinhaGeocodificada {
  return {
    carga: 'CARGA-1',
    destino: 'RIO DE JANEIRO',
    placa: 'ABC1234',
    motorista: 'MOTORISTA',
    ajudantes: [],
    nf: 'NF001',
    clienteCodigo: 'C1',
    clienteNome: 'CLIENTE',
    endereco: 'RUA A, 1 - RIO DE JANEIRO',
    lat: -22.9,
    lng: -43.2,
    ...over,
  }
}

// Achado Minor #9 da revisão final do plano do pão (15/09): prova direta
// (sem passar pela rota HTTP) de que o log de colisão dispara quando duas
// linhas da MESMA placa trazem a MESMA NF -- cenário que o mock do
// route.test.ts não consegue forçar facilmente entre os dois documentos.
describe('logarNfDuplicadaNaMesmaPlaca', () => {
  it('loga quando duas linhas da mesma placa têm a mesma NF (romaneio principal x pão colidindo)', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const linhasPorPlaca = new Map<string, LinhaGeocodificada[]>([
      ['ABC1234', [linha({ nf: 'NF001' }), linha({ nf: 'NF001', clienteNome: 'PÃO' })]],
    ])

    logarNfDuplicadaNaMesmaPlaca(linhasPorPlaca)

    expect(errSpy).toHaveBeenCalledTimes(1)
    expect(errSpy.mock.calls[0][0]).toContain('NF duplicada na mesma placa')
    expect(errSpy.mock.calls[0][0]).toContain('ABC1234')
    expect(errSpy.mock.calls[0][0]).toContain('NF001')

    errSpy.mockRestore()
  })

  it('não loga quando as NFs da mesma placa são todas distintas (caminho normal)', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const linhasPorPlaca = new Map<string, LinhaGeocodificada[]>([
      ['ABC1234', [linha({ nf: 'NF001' }), linha({ nf: 'NF900', clienteNome: 'PÃO' })]],
    ])

    logarNfDuplicadaNaMesmaPlaca(linhasPorPlaca)

    expect(errSpy).not.toHaveBeenCalled()

    errSpy.mockRestore()
  })

  it('não loga quando a mesma NF aparece em placas diferentes (não é colisão)', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const linhasPorPlaca = new Map<string, LinhaGeocodificada[]>([
      ['ABC1234', [linha({ nf: 'NF001' })]],
      ['XYZ5678', [linha({ nf: 'NF001', placa: 'XYZ5678' })]],
    ])

    logarNfDuplicadaNaMesmaPlaca(linhasPorPlaca)

    expect(errSpy).not.toHaveBeenCalled()

    errSpy.mockRestore()
  })
})
