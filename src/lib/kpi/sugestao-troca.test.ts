import { describe, it, expect } from 'vitest'
import { textoSugestaoTroca } from './sugestao-troca'

describe('textoSugestaoTroca', () => {
  it('alta com hora → "Possível troca" nomeando placa e horário', () => {
    expect(textoSugestaoTroca('ABC1D23', 'alta', '07:45'))
      .toBe('Possível troca: a placa ABC1D23 esteve nesta loja às 07:45, confirmar.')
  })
  it('alta sem hora → omite o trecho de horário', () => {
    expect(textoSugestaoTroca('ABC1D23', 'alta', null))
      .toBe('Possível troca: a placa ABC1D23 esteve nesta loja, confirmar.')
  })
  it('baixa → hipótese geográfica marcada como não confirmada', () => {
    expect(textoSugestaoTroca('XYZ9K88', 'baixa', '06:10'))
      .toBe('Verificar: nenhum carro da escala registrou GPS aqui; a placa XYZ9K88 passou perto às 06:10 (não confirmado).')
  })
  it('não usa travessão', () => {
    expect(textoSugestaoTroca('ABC1D23', 'alta', '07:45')).not.toContain('—')
  })
})
