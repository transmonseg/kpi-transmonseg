import { describe, expect, it, vi } from 'vitest'
import { carregarCadastroPlacasPdf } from './cadastro-placas'

describe('carregarCadastroPlacasPdf', () => {
  it('combina frota ativa com historico limitado de paradas', async () => {
    const frotaEq = vi.fn().mockResolvedValue({
      data: [{ placa_norm: 'ABC1234' }, { placa_norm: null }],
    })
    const frotaSelect = vi.fn(() => ({ eq: frotaEq }))

    const histLimit = vi.fn().mockResolvedValue({
      data: [{ placa_norm: 'DEF5678' }, { placa_norm: 'ABC1234' }],
    })
    const histNot = vi.fn(() => ({ limit: histLimit }))
    const histSelect = vi.fn(() => ({ not: histNot }))

    const from = vi.fn((table: string) => {
      if (table === 'veiculos') return { select: frotaSelect }
      if (table === 'unitrac_paradas') return { select: histSelect }
      throw new Error(`Tabela inesperada: ${table}`)
    })

    const placas = await carregarCadastroPlacasPdf({ from })

    expect(frotaSelect).toHaveBeenCalledWith('placa_norm')
    expect(frotaEq).toHaveBeenCalledWith('ativo', true)
    expect(histSelect).toHaveBeenCalledWith('placa_norm')
    expect(histNot).toHaveBeenCalledWith('placa_norm', 'is', null)
    expect(histLimit).toHaveBeenCalledWith(20000)
    expect([...placas].sort()).toEqual(['ABC1234', 'DEF5678'])
  })
})
