import { describe, it, expect } from 'vitest'
import { seloPonto } from './selo-ponto'

// F4-07 (GEO-24): selo de precisão e círculo de incerteza do ponto do cliente
// no mapa do Ao vivo/monitoramento. O raio só existe quando a cascata do CNEFE
// informou a precisão (os mesmos raios da ponte: exato 30 m, interpolado 50 m,
// trecho até 300 m, rua 1 km); sem precisão, só o selo -- nada inventado.
describe('seloPonto', () => {
  it('precisão da cascata: selo e raio', () => {
    expect(seloPonto({ precisao: 'exato' })).toEqual({ codigo: 'exato', raioM: 30 })
    expect(seloPonto({ precisao: 'exato_nao_confirmado' })).toEqual({ codigo: 'exato_nao_confirmado', raioM: 30 })
    expect(seloPonto({ precisao: 'interpolado' })).toEqual({ codigo: 'interpolado', raioM: 50 })
    expect(seloPonto({ precisao: 'trecho' })).toEqual({ codigo: 'trecho', raioM: 300 })
    expect(seloPonto({ precisao: 'rua' })).toEqual({ codigo: 'rua', raioM: 1000 })
  })
  it('correção à mão e cadastro vêm antes da precisão; bairro e aproximado sem raio', () => {
    expect(seloPonto({ fonte: 'manual', precisao: 'rua' })).toEqual({ codigo: 'manual', raioM: null })
    expect(seloPonto({ fonte: 'verificacao_manual' })).toEqual({ codigo: 'manual', raioM: null })
    expect(seloPonto({ fonte: 'cadastro_unitrac' })).toEqual({ codigo: 'cadastro', raioM: null })
    expect(seloPonto({ fonte: 'cnefe_bairro' })).toEqual({ codigo: 'bairro', raioM: null })
    expect(seloPonto({ impreciso: true })).toEqual({ codigo: 'aproximado', raioM: null })
  })
  it('sem nada: sem selo', () => {
    expect(seloPonto({})).toBeNull()
    expect(seloPonto({ precisao: 'qualquer' })).toBeNull()
  })
})
