import { describe, it, expect } from 'vitest'
import { caminhoMonitoramento, rotaPainelMonitoramento } from './sistema-transmonseg'

describe('rotas do monitoramento dentro do painel', () => {
  it('ida e volta', () => {
    expect(caminhoMonitoramento('/painel/monitoramento')).toBe('/')
    expect(caminhoMonitoramento('/painel/monitoramento/central-romaneio')).toBe('/central-romaneio')
    expect(rotaPainelMonitoramento('/')).toBe('/painel/monitoramento')
    expect(rotaPainelMonitoramento('/veiculos')).toBe('/painel/monitoramento/veiculos')
  })
})
