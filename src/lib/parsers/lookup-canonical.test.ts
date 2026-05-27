import { describe, it, expect } from 'vitest'
import { buildLookupContext, lookupSlot } from './lookup-canonical'
import type { ParseContext } from './alteracoes-v2.types'

describe('buildLookupContext', () => {
  it('lê escala_linhas e lojas e retorna contexto', async () => {
    const svc = mockSupabase({
      escala_linhas: [
        { motorista_nome: 'José Roberto', motorista_codigo: 138, placa_norm: 'DDI6J90', placa_raw: 'DDI-6J90', data_entrega: '2026-05-18', rede_id: 'ASSAI' },
        { motorista_nome: 'José Roberto', motorista_codigo: 138, placa_norm: 'DBB8D19', placa_raw: 'DBB-8D19', data_entrega: '2026-05-17', rede_id: 'ASSAI' },
      ],
      lojas: [
        { rede_id: 'ASSAI', nome: 'ASSAI TIJUCA II', codigo_escala: '150' },
      ],
    })
    const ctx = await buildLookupContext(svc)
    expect(ctx.associacoes).toHaveLength(2)
    expect(ctx.associacoes[0].motorista_nome_norm).toBe('JOSE ROBERTO')
    expect(ctx.lojas).toHaveLength(1)
  })
})

const ctxBase: ParseContext = {
  associacoes: [
    { motorista_nome: 'José Roberto', motorista_nome_norm: 'JOSE ROBERTO', motorista_codigo: 138, placa_norm: 'DDI6J90', placa_raw: 'DDI-6J90', data_entrega: '2026-05-18', rede_id: 'ASSAI' },
    { motorista_nome: 'Paulo Henrique', motorista_nome_norm: 'PAULO HENRIQUE', motorista_codigo: 807, placa_norm: 'DBB8D19', placa_raw: 'DBB-8D19', data_entrega: '2026-05-17', rede_id: 'ASSAI' },
  ],
  lojas: [],
}

describe('lookupSlot', () => {
  it('resolve por placa: retorna nome e código mais recentes', () => {
    const slot = lookupSlot({ placas: ['DDI6J90'], codigos: [], nomeHint: '' }, ctxBase)
    expect(slot.motorista_nome).toBe('José Roberto')
    expect(slot.motorista_codigo).toBe(138)
    expect(slot.fonte_placa).toBe('mensagem')
    expect(slot.fonte_nome).toBe('banco')
    expect(slot.fonte_codigo).toBe('banco')
  })

  it('resolve por código: retorna nome e placa', () => {
    const slot = lookupSlot({ placas: [], codigos: [807], nomeHint: '' }, ctxBase)
    expect(slot.motorista_nome).toBe('Paulo Henrique')
    expect(slot.placa_norm).toBe('DBB8D19')
    expect(slot.fonte_nome).toBe('banco')
    expect(slot.fonte_placa).toBe('banco')
  })

  it('resolve por nome fuzzy: aceita pequena variação', () => {
    const slot = lookupSlot({ placas: [], codigos: [], nomeHint: 'JOSE ROBERTO' }, ctxBase)
    expect(slot.motorista_codigo).toBe(138)
    expect(slot.placa_norm).toBe('DDI6J90')
  })

  it('retorna slot vazio quando nada bate', () => {
    const slot = lookupSlot({ placas: ['XYZ1234'], codigos: [999], nomeHint: 'fantasma' }, ctxBase)
    expect(slot.motorista_nome).toBe(null)
    expect(slot.fonte_nome).toBe(null)
    expect(slot.placa_norm).toBe('XYZ1234')
    expect(slot.fonte_placa).toBe('mensagem')
  })
})

describe('Bug B — lookupSlot filtra por rede (auditoria dia 25 2026-05-27)', () => {
  const ctxCross: ParseContext = {
    associacoes: [
      { motorista_nome: 'MARCOS FERNANDO', motorista_nome_norm: 'MARCOS FERNANDO', motorista_codigo: 353, placa_norm: 'UBO5E05', placa_raw: 'UBO-5E05', data_entrega: '2026-05-19', rede_id: 'ZONA_SUL' },
      { motorista_nome: 'ALLAN', motorista_nome_norm: 'ALLAN', motorista_codigo: 294, placa_norm: 'EZU9J51', placa_raw: 'EZU-9J51', data_entrega: '2026-05-24', rede_id: 'ASSAI' },
    ],
    lojas: [],
  }

  it('com redeId=ASSAI, NAO retorna MARCOS FERNANDO (ZONA_SUL) ao buscar UBO5E05', () => {
    const slot = lookupSlot(
      { placas: ['UBO5E05'], codigos: [], nomeHint: '', redeId: 'ASSAI' },
      ctxCross,
    )
    expect(slot.motorista_nome).toBe(null)
    expect(slot.placa_norm).toBe('UBO5E05')
  })

  it('sem redeId, comportamento anterior preserva (cross-rede leak)', () => {
    const slot = lookupSlot(
      { placas: ['UBO5E05'], codigos: [], nomeHint: '' },
      ctxCross,
    )
    expect(slot.motorista_nome).toBe('MARCOS FERNANDO')
  })

  it('com redeId=ASSAI, acha ALLAN quando placa EZU9J51 (ASSAI)', () => {
    const slot = lookupSlot(
      { placas: ['EZU9J51'], codigos: [], nomeHint: '', redeId: 'ASSAI' },
      ctxCross,
    )
    expect(slot.motorista_nome).toBe('ALLAN')
  })

  it('com redeId=ZONA_SUL, acha MARCOS FERNANDO (proprio escopo)', () => {
    const slot = lookupSlot(
      { placas: ['UBO5E05'], codigos: [], nomeHint: '', redeId: 'ZONA_SUL' },
      ctxCross,
    )
    expect(slot.motorista_nome).toBe('MARCOS FERNANDO')
  })

  it('redeId tambem filtra busca por codigo', () => {
    const slot = lookupSlot(
      { placas: [], codigos: [353], nomeHint: '', redeId: 'ASSAI' },
      ctxCross,
    )
    expect(slot.motorista_nome).toBe(null)
  })

  it('redeId tambem filtra busca por nome (preferNome)', () => {
    const slot = lookupSlot(
      { placas: [], codigos: [], nomeHint: 'MARCOS FERNANDO', redeId: 'ASSAI' },
      ctxCross,
      { preferNome: true },
    )
    expect(slot.motorista_nome).toBe(null)
  })
})

describe('U3 — lookupSlot preferNome (auditoria 2026-05-27)', () => {
  // Caso real: placa TML-7D61 historicamente associada a ERALDO, mas WhatsApp
  // diz BRUNO + TML-7D61. preferNome=true deve usar BRUNO (nomeHint vence).
  const ctxConflito: ParseContext = {
    associacoes: [
      { motorista_nome: 'Eraldo', motorista_nome_norm: 'ERALDO', motorista_codigo: 100, placa_norm: 'TML7D61', placa_raw: 'TML-7D61', data_entrega: '2026-05-20', rede_id: 'SUPERPRIX' },
      { motorista_nome: 'Bruno', motorista_nome_norm: 'BRUNO', motorista_codigo: 200, placa_norm: 'XYZ9999', placa_raw: 'XYZ-9999', data_entrega: '2026-05-19', rede_id: 'SUPERPRIX' },
    ],
    lojas: [],
  }

  it('preferNome=true: nomeHint BRUNO vence placa associada a ERALDO', () => {
    const slot = lookupSlot(
      { placas: ['TML7D61'], codigos: [], nomeHint: 'BRUNO' },
      ctxConflito,
      { preferNome: true },
    )
    expect(slot.motorista_nome).toMatch(/Bruno/i)
    expect(slot.placa_norm).toBe('TML7D61')
    expect(slot.fonte_placa).toBe('mensagem')
  })

  it('preferNome=false (default): comportamento atual mantido (placa vence)', () => {
    const slot = lookupSlot(
      { placas: ['TML7D61'], codigos: [], nomeHint: 'BRUNO' },
      ctxConflito,
    )
    expect(slot.motorista_nome).toMatch(/Eraldo/i)
  })

  it('preferNome=true sem nomeHint: cai pra match por placa', () => {
    const slot = lookupSlot(
      { placas: ['TML7D61'], codigos: [], nomeHint: '' },
      ctxConflito,
      { preferNome: true },
    )
    expect(slot.motorista_nome).toMatch(/Eraldo/i)
  })

  it('preferNome=true com nomeHint sem match no banco: cai pra placa', () => {
    const slot = lookupSlot(
      { placas: ['TML7D61'], codigos: [], nomeHint: 'JOAO INEXISTENTE' },
      ctxConflito,
      { preferNome: true },
    )
    expect(slot.motorista_nome).toMatch(/Eraldo/i)
  })
})

function mockSupabase(tables: Record<string, unknown[]>) {
  return {
    from(tableName: string) {
      const data = tables[tableName] ?? []
      const chain = {
        select: () => chain,
        gte: () => chain,
        eq: () => chain,
        order: () => chain,
        then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
          resolve({ data, error: null }),
      }
      return chain
    },
  } as unknown as import('@supabase/supabase-js').SupabaseClient
}
