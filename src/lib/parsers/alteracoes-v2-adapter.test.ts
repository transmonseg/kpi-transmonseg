import { describe, it, expect } from 'vitest'
import { blocoToParsed } from './alteracoes-v2-adapter'
import type { AlteracaoBloco, SlotVeiculo } from './alteracoes-v2.types'

const makeSlot = (over: Partial<SlotVeiculo> = {}): SlotVeiculo => ({
  motorista_nome: 'ERALDO',
  motorista_codigo: null,
  placa_norm: 'TML7D61',
  placa_raw: 'TML-7D61',
  fonte_nome: 'mensagem',
  fonte_codigo: null,
  fonte_placa: 'mensagem',
  ...over,
})

const makeBloco = (over: Partial<AlteracaoBloco> = {}): AlteracaoBloco => ({
  rede_id: 'SUPERPRIX',
  loja_nome_raw: 'Barra',
  filial: null,
  sai: makeSlot({ motorista_nome: 'BRUNO', placa_norm: null, placa_raw: null, fonte_placa: null }),
  entra: makeSlot(),
  motivo: null,
  confianca: 'alta',
  warnings: [],
  raw: 'BRUNO TROCANDO COM ERALDO NA BARRA',
  ...over,
})

describe('blocoToParsed — adapter v2→v1', () => {
  it('entra+sai presentes → tipo=SUBSTITUICAO', () => {
    const r = blocoToParsed(makeBloco())
    expect(r.tipo).toBe('SUBSTITUICAO')
    expect(r.entra?.motorista_nome).toBe('ERALDO')
    expect(r.sai?.motorista_nome).toBe('BRUNO')
    expect(r.rede_id).toBe('SUPERPRIX')
    expect(r.loja_nome_raw).toBe('Barra')
    expect(r.texto_original).toBe('BRUNO TROCANDO COM ERALDO NA BARRA')
  })

  it('só entra (sem sai) → tipo=INCLUSAO', () => {
    const r = blocoToParsed(makeBloco({ sai: null }))
    expect(r.tipo).toBe('INCLUSAO')
  })

  it('só sai (sem entra) → tipo=COMUNICADO', () => {
    const r = blocoToParsed(makeBloco({ entra: null }))
    expect(r.tipo).toBe('COMUNICADO')
  })

  it('nenhum slot → tipo=COMUNICADO (fallback v1)', () => {
    const r = blocoToParsed(makeBloco({ entra: null, sai: null }))
    expect(r.tipo).toBe('COMUNICADO')
  })

  it('raw começando com "Comunicado:" → tipo=COMUNICADO mesmo com slots', () => {
    const r = blocoToParsed(makeBloco({ raw: 'Comunicado: BRUNO sai HOJE' }))
    expect(r.tipo).toBe('COMUNICADO')
  })

  it('raw com "troca de carro" + duas placas → tipo=SWAP', () => {
    const r = blocoToParsed(makeBloco({
      raw: 'Troca de carro: motorista mesmo. PLACA TML-7D61 entra, XYZ-9999 sai',
      sai: makeSlot({ motorista_nome: 'ERALDO', placa_norm: 'XYZ9999', placa_raw: 'XYZ-9999' }),
    }))
    expect(r.tipo).toBe('SWAP')
  })

  it('raw com "segunda viagem" → tipo=INFORMATIVO', () => {
    const r = blocoToParsed(makeBloco({ raw: 'BRUNO faz segunda viagem hoje' }))
    expect(r.tipo).toBe('INFORMATIVO')
  })

  it('descarta fontes do v2 (não vazam pro shape v1)', () => {
    const r = blocoToParsed(makeBloco())
    expect(r.entra).not.toHaveProperty('fonte_nome')
    expect(r.entra).not.toHaveProperty('fonte_placa')
    expect(r.entra).not.toHaveProperty('fonte_codigo')
    expect(r.entra?.placa_norm).toBe('TML7D61')
    expect(r.entra?.motorista_nome).toBe('ERALDO')
  })

  it('preserva confianca do bloco', () => {
    const r = blocoToParsed(makeBloco({ confianca: 'baixa' }))
    expect(r.confianca).toBe('baixa')
  })
})
