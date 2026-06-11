import { describe, it, expect, vi, afterEach } from 'vitest'
import { apiGet, apiPost } from './client'

afterEach(() => vi.restoreAllMocks())

describe('client best-effort', () => {
  it('retorna o JSON em sucesso', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: 1 }), { status: 200 }),
    )
    expect(await apiGet('/x')).toEqual({ ok: 1 })
  })

  it('retorna null quando a API falha (nunca lança)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('down'))
    expect(await apiGet('/x')).toBeNull()
    expect(await apiPost('/x', [])).toBeNull()
  })

  it('retorna null em status != 200', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 500 }))
    expect(await apiGet('/x')).toBeNull()
  })
})
