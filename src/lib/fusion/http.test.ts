// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('fusionFetch', () => {
  beforeEach(() => { vi.resetModules(); delete process.env.FUSION_PROXY })
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.FUSION_PROXY })

  it('sem FUSION_PROXY, chama o fetch sem dispatcher', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok'))
    vi.stubGlobal('fetch', fetchMock)
    const { fusionFetch } = await import('./http')
    await fusionFetch('https://x/y', { method: 'GET' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((fetchMock.mock.calls[0][1] as any).dispatcher).toBeUndefined()
  })

  it('com FUSION_PROXY, injeta um dispatcher no fetch', async () => {
    process.env.FUSION_PROXY = 'http://127.0.0.1:8899'
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok'))
    vi.stubGlobal('fetch', fetchMock)
    const { fusionFetch } = await import('./http')
    await fusionFetch('https://x/y', { method: 'GET' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((fetchMock.mock.calls[0][1] as any).dispatcher).toBeDefined()
  })
})
