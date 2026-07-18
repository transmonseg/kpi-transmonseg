import { describe, it, expect, vi } from 'vitest'
import { salvarGeracao, buscarGeracao } from './historico'
import type { SupabaseClient } from '@supabase/supabase-js'

function fakeSvc(overrides: {
  insertResult?: { data: { id: string } | null; error: unknown }
  selectResult?: { data: { tipo: string } | null; error: unknown }
  downloadResult?: { data: { text: () => Promise<string> } | null; error: unknown }
  throwOnUpload?: boolean
}): SupabaseClient {
  const single = vi.fn(async () => overrides.insertResult ?? { data: { id: 'abc-123' }, error: null })
  const selectAfterInsert = vi.fn(() => ({ single }))
  const insert = vi.fn(() => ({ select: selectAfterInsert }))

  const maybeSingle = vi.fn(async () => overrides.selectResult ?? { data: { tipo: 'KPI' }, error: null })
  const eq = vi.fn(() => ({ maybeSingle }))
  const selectForRead = vi.fn(() => ({ eq }))

  const from = vi.fn((_table: string) => ({ insert, select: selectForRead }))

  const upload = vi.fn(async () => {
    if (overrides.throwOnUpload) throw new Error('upload boom')
    return { error: null }
  })
  const download = vi.fn(async () => overrides.downloadResult ?? { data: null, error: new Error('not found') })
  const storageFrom = vi.fn(() => ({ upload, download }))
  const createBucket = vi.fn(async () => ({ error: null }))

  return { from, storage: { from: storageFrom, createBucket } } as unknown as SupabaseClient
}

describe('salvarGeracao', () => {
  it('insere a linha, sobe o cache.json, devolve o id', async () => {
    const svc = fakeSvc({})
    const id = await salvarGeracao(svc, {
      tipo: 'KPI', data: '2026-07-17', filename: 'KPI-Nutry-Max-2026-07-17.xlsx',
      resumo: { total: 71 }, geradoPor: 'user-1', payload: { resumo: { total: 71 } },
    })
    expect(id).toBe('abc-123')
  })

  it('devolve null quando o insert falha, sem lançar', async () => {
    const svc = fakeSvc({ insertResult: { data: null, error: new Error('insert falhou') } })
    const id = await salvarGeracao(svc, {
      tipo: 'KPI', data: '2026-07-17', filename: 'x.xlsx', resumo: {}, geradoPor: 'user-1', payload: {},
    })
    expect(id).toBeNull()
  })

  it('devolve o id mesmo quando o upload do cache falha (best-effort)', async () => {
    const svc = fakeSvc({ throwOnUpload: true })
    const id = await salvarGeracao(svc, {
      tipo: 'ROMANEIO', data: '2026-07-17', filename: 'x.xlsx', resumo: {}, geradoPor: 'user-1', payload: {},
    })
    expect(id).toBe('abc-123')
  })
})

describe('buscarGeracao', () => {
  it('busca a linha e devolve tipo + payload do cache', async () => {
    const svc = fakeSvc({
      selectResult: { data: { tipo: 'ROMANEIO' }, error: null },
      downloadResult: { data: { text: async () => JSON.stringify({ resumo: { total: 5 } }) }, error: null },
    })
    const geracao = await buscarGeracao(svc, 'abc-123')
    expect(geracao).toEqual({ tipo: 'ROMANEIO', payload: { resumo: { total: 5 } } })
  })

  it('devolve null quando a linha não existe', async () => {
    const svc = fakeSvc({ selectResult: { data: null, error: null } })
    const geracao = await buscarGeracao(svc, 'nao-existe')
    expect(geracao).toBeNull()
  })

  it('devolve null quando o cache.json não existe', async () => {
    const svc = fakeSvc({
      selectResult: { data: { tipo: 'KPI' }, error: null },
      downloadResult: { data: null, error: new Error('not found') },
    })
    const geracao = await buscarGeracao(svc, 'abc-123')
    expect(geracao).toBeNull()
  })
})
