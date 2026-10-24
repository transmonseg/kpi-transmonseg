import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../acesso', () => ({
  acessoAoVivo: vi.fn(async (cliente: string | null) => ({ ok: true, cliente, email: 't@t', clientes: ['rioquality'] })),
}))
// F4-09: a rota usa buscarDiaRioQualityFusionCompleto; nos testes antigos ele
// devolve o que buscarDiaRioQualityFusion devolver, como grade.
const comoFonte = { fonte: 'fusion' as 'fusion' | 'fusion55', aviso: null as string | null }
vi.mock('@/lib/kpi-rioquality/fonte-fusion', () => {
  const buscarDiaRioQualityFusion = vi.fn()
  return {
    buscarDiaRioQualityFusion,
    buscarDiaRioQualityFusionCompleto: vi.fn(async (d: string) => ({ linhas: await buscarDiaRioQualityFusion(d), ...comoFonte })),
  }
})
vi.mock('@/lib/data-br', () => ({ hojeBR: () => '2026-10-11' }))
const guardar = vi.fn(async (..._a: unknown[]) => {})
const calcular = vi.fn(async (..._a: unknown[]) => {})
const fonteDoDia = vi.fn(async (..._a: unknown[]): Promise<string | null> => null)
vi.mock('@/lib/kpi-romaneio/ao-vivo-servico', () => ({
  fonteDoDiaAoVivo: (...a: unknown[]) => fonteDoDia(...a),
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

// F4-09 (KRQ-02): "Puxar da Fusion" e "Voltar a puxar da Fusion" trazem o
// relatorio de 55 colunas (NF real, bairro); a grade so' de reserva, com aviso.
describe('F4-09: Puxar da Fusion com o relatorio de 55 colunas', () => {
  beforeEach(() => { guardar.mockClear(); registrar.mockClear(); fonteDoDia.mockReset(); fonteDoDia.mockResolvedValue('manual'); comoFonte.fonte = 'fusion'; comoFonte.aviso = null })

  it('dia manual -> 55 colunas: guarda fonte fusion55, sem aviso', async () => {
    const { buscarDiaRioQualityFusion, buscarDiaRioQualityFusionCompleto } = await import('@/lib/kpi-rioquality/fonte-fusion')
    comoFonte.fonte = 'fusion55'
    vi.mocked(buscarDiaRioQualityFusion).mockResolvedValue([{ placaNorm: 'TTT1J28', nf: '5555374', pedidoErp: '6072386', bairro: 'PARQUE TARCISIO MIRANDA' }] as never)
    const { POST } = await import('./route')
    const res = await POST(req())
    expect(await res.json()).toMatchObject({ ok: true, fonte: 'fusion55', aviso: null })
    expect(buscarDiaRioQualityFusionCompleto).toHaveBeenLastCalledWith('2026-10-10', { gradeComoReserva: true })
    expect(guardar).toHaveBeenCalledWith(expect.objectContaining({ fonte: 'fusion55' }))
    expect(registrar).toHaveBeenCalledWith('2026-10-10', expect.objectContaining({ situacao: 'ok', aviso: null }))
  })

  it('caiu na grade: devolve e registra o aviso', async () => {
    const { buscarDiaRioQualityFusion } = await import('@/lib/kpi-rioquality/fonte-fusion')
    comoFonte.aviso = 'O relatório de 55 colunas da Fusion falhou (x): o dia veio da grade'
    vi.mocked(buscarDiaRioQualityFusion).mockResolvedValue([{ placaNorm: 'TTT1J28', nf: '6072386' }] as never)
    const { POST } = await import('./route')
    expect(await (await POST(req())).json()).toMatchObject({ ok: true, fonte: 'fusion', aviso: comoFonte.aviso })
    expect(registrar).toHaveBeenCalledWith('2026-10-10', expect.objectContaining({ situacao: 'ok', aviso: comoFonte.aviso }))
  })

  it('dia ja de 55 colunas: sem grade de reserva', async () => {
    const { buscarDiaRioQualityFusion, buscarDiaRioQualityFusionCompleto } = await import('@/lib/kpi-rioquality/fonte-fusion')
    fonteDoDia.mockResolvedValue('fusion55')
    vi.mocked(buscarDiaRioQualityFusion).mockResolvedValue([{ placaNorm: 'TTT1J28', nf: '5555374' }] as never)
    const { POST } = await import('./route')
    await POST(req())
    expect(buscarDiaRioQualityFusionCompleto).toHaveBeenLastCalledWith('2026-10-10', { gradeComoReserva: false })
  })
})
