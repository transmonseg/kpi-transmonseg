import { describe, it, expect } from 'vitest'
import { caminhoMonitoramento, rotaPainelMonitoramento, ROTA_INICIO_MONITORAMENTO } from './sistema-transmonseg'

describe('rotas do monitoramento dentro do painel', () => {
  it('ida e volta', () => {
    expect(caminhoMonitoramento('/painel/monitoramento')).toBe('/')
    expect(caminhoMonitoramento('/painel/monitoramento/central-romaneio')).toBe('/central-romaneio')
    expect(rotaPainelMonitoramento('/')).toBe('/painel/monitoramento')
    expect(rotaPainelMonitoramento('/veiculos')).toBe('/painel/monitoramento/veiculos')
  })

  it('F3-12 (AC-08): o botão "Monitoramento" abre a Central Romaneio, não a Central Unitrac (76 MB)', () => {
    expect(ROTA_INICIO_MONITORAMENTO).toBe('/painel/monitoramento/central-romaneio')
    expect(caminhoMonitoramento(ROTA_INICIO_MONITORAMENTO)).toBe('/central-romaneio')
  })
})
