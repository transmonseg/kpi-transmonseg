import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../acesso', () => ({
  acessoAoVivo: vi.fn(async (cliente: string | null) => ({ ok: true, cliente, email: 't@t', clientes: ['rioquality'] })),
}))
vi.mock('@/lib/kpi-rioquality/fonte-fusion', () => ({ buscarDiaRioQualityFusion: vi.fn() }))
vi.mock('@/lib/data-br', () => ({ hojeBR: () => '2026-10-11' }))
const guardar = vi.fn(async (..._a: unknown[]) => {})
const calcular = vi.fn(async (..._a: unknown[]) => {})
vi.mock('@/lib/kpi-romaneio/ao-vivo-servico', () => ({
  guardarDiaAoVivo: (...a: unknown[]) => guardar(...a),
  calcularAoVivo: (...a: unknown[]) => calcular(...a),
}))

// F2-05: o botao "voltar a puxar da Fusion" tambem registra a tentativa.
const registrar = vi.fn(async (..._a: unknown[]) => null)
vi.mock('@/lib/kpi-rioquality/status-fusion-banco', () => ({ registrarSyncFusion: (...a: unknown[]) => registrar(...a) }))

const req = (cliente = 'rioquality') =>
  new Request(`http://x/api/kpi/ao-vivo/fusion?cliente=${cliente}&data=2026-10-10`, { method: 'POST' })

describe('POST /api/kpi/ao-vivo/fusion', () => {
  beforeEach(() => { guardar.mockClear(); calcular.mockClear(); registrar.mockClear() })

  it('grava o dia quando a Fusion retorna entregas', async () => {
    const { buscarDiaRioQualityFusion } = await import('@/lib/kpi-rioquality/fonte-fusion')
    vi.mocked(buscarDiaRioQualityFusion).mockResolvedValue([{ placaNorm: 'ABC1D23', nf: 'ABC1D23-1', clienteNome: 'X' }] as never)
    const { POST } = await import('./route')
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, nfs: 1, placas: 1, fonte: 'fusion' })
    expect(guardar).toHaveBeenCalledWith(expect.objectContaining({ fonte: 'fusion', pao: { linhas: [], escala: [] } }))
  })

  it('usa hojeBR() como data default quando não vem data', async () => {
    const { buscarDiaRioQualityFusion } = await import('@/lib/kpi-rioquality/fonte-fusion')
    vi.mocked(buscarDiaRioQualityFusion).mockClear()
    vi.mocked(buscarDiaRioQualityFusion).mockResolvedValue([{ placaNorm: 'ABC1D23', nf: 'ABC1D23-1', clienteNome: 'X' }] as never)
    const { POST } = await import('./route')
    const res = await POST(new Request('http://x/api/kpi/ao-vivo/fusion?cliente=rioquality', { method: 'POST' }))
    expect(res.status).toBe(200)
    expect(buscarDiaRioQualityFusion).toHaveBeenCalledWith('2026-10-11')
  })

  it('409 sem gravar quando a Fusion não tem dados', async () => {
    const { buscarDiaRioQualityFusion } = await import('@/lib/kpi-rioquality/fonte-fusion')
    vi.mocked(buscarDiaRioQualityFusion).mockResolvedValue([])
    const { POST } = await import('./route')
    const res = await POST(req())
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ ok: false, motivo: 'sem_dados_fusion' })
    expect(guardar).not.toHaveBeenCalled()
  })

  it('400 se cliente não é rioquality', async () => {
    const { POST } = await import('./route')
    const res = await POST(req('nutrymax'))
    expect(res.status).toBe(400)
    expect(guardar).not.toHaveBeenCalled()
  })

  it('502 em erro da Fusion', async () => {
    const { buscarDiaRioQualityFusion } = await import('@/lib/kpi-rioquality/fonte-fusion')
    vi.mocked(buscarDiaRioQualityFusion).mockRejectedValue(new Error('boom'))
    const { POST } = await import('./route')
    const res = await POST(req())
    expect(res.status).toBe(502)
    expect(guardar).not.toHaveBeenCalled()
  })

  it('F2-05: Fusion fora registra o erro no status do dia; sucesso registra ok', async () => {
    const { buscarDiaRioQualityFusion } = await import('@/lib/kpi-rioquality/fonte-fusion')
    vi.mocked(buscarDiaRioQualityFusion).mockRejectedValue(new TypeError('fetch failed'))
    const { POST } = await import('./route')
    expect((await POST(req())).status).toBe(502)
    expect(registrar).toHaveBeenCalledWith('2026-10-10', expect.objectContaining({ situacao: 'erro', erro: 'TypeError: fetch failed' }))
    vi.mocked(buscarDiaRioQualityFusion).mockResolvedValue([{ placaNorm: 'ABC1D23', nf: 'ABC1D23-1', clienteNome: 'X' }] as never)
    expect((await POST(req())).status).toBe(200)
    expect(registrar).toHaveBeenLastCalledWith('2026-10-10', expect.objectContaining({ situacao: 'ok' }))
  })
})
