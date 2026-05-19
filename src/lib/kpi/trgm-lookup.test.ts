import { describe, it, expect, vi, beforeEach } from 'vitest'
import { batchTrgmLookup } from './trgm-lookup'

const mockRpc = vi.fn()
const mockSupabase = { rpc: mockRpc } as any

describe('batchTrgmLookup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retorna matches para nomes conhecidos', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ input_name: 'assai', canonical_id: 'abc', canonical_nm: 'Assai', trgm_score: 0.9, match_source: 'canonical' }],
      error: null
    })
    const r = await batchTrgmLookup(mockSupabase, ['assai'])
    expect(r['assai']?.canonical_nm).toBe('Assai')
  })

  it('retorna {} para nome desconhecido', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null })
    expect(await batchTrgmLookup(mockSupabase, ['xyzabc'])).toEqual({})
  })

  it('retorna {} quando supabase retorna erro', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } })
    expect(await batchTrgmLookup(mockSupabase, ['assai'])).toEqual({})
  })

  it('retorna {} para array vazio', async () => {
    expect(await batchTrgmLookup(mockSupabase, [])).toEqual({})
    expect(mockRpc).not.toHaveBeenCalled()
  })
})
