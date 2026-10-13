import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../acesso', () => ({
  acessoAoVivo: vi.fn(async (cliente: string | null) => ({ ok: true, cliente, email: 't@t', clientes: ['nutrimax'] })),
}))
vi.mock('@/lib/data-br', () => ({ hojeBR: () => '2026-10-13' }))
vi.mock('@/lib/unitrac-api', () => ({
  buscarFrota: vi.fn(async () => [{ placaNorm: 'AAA1A11' }, { placaNorm: 'BBB2B22' }]),
  normPlaca: (s: string) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''),
}))
vi.mock('@/lib/kpi-romaneio/ao-vivo-servico', () => ({ calcularAoVivo: vi.fn(async () => 'ok') }))

// createServiceClient: romaneio do dia com 1 NF na placa A e 1 na placa B;
// kpi_troca_placa aceita delete/insert/select.
const romaneioRow = { romaneio: [{ placa: 'AAA1A11', nf: 'NF-A', carga: 'C1' }, { placa: 'BBB2B22', nf: 'NF-B', carga: 'C2' }], pao: { linhas: [] } }
function chain(result: unknown) {
  const o: Record<string, unknown> = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
  for (const m of ['select', 'delete', 'insert', 'update', 'eq', 'is', 'in', 'order', 'limit']) o[m] = () => o
  o.maybeSingle = async () => result
  return o
}
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (t: string) => t === 'kpi_ao_vivo_dia' ? chain({ data: romaneioRow }) : chain({ data: [], error: null }),
  }),
}))

async function post(body: unknown) {
  const { POST } = await import('./route')
  const res = await POST(new Request('http://x/api/kpi/ao-vivo/troca', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))
  return { status: res.status, json: await res.json().catch(() => null) as Record<string, unknown> | null }
}

describe('POST /api/kpi/ao-vivo/troca (modos)', () => {
  beforeEach(() => { process.env.MOTOR_SECRET = 's'; process.env.MONITORAMENTO_URL = 'http://mon' })
  afterEach(() => vi.unstubAllGlobals())

  it('mútua: 2 movimentos com as NFs de cada placa (ordem capturada antes de aplicar)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, pontos: 1 })))
    vi.stubGlobal('fetch', fetchMock)
    const r = await post({ modo: 'mutua', placaEscala: 'AAA1A11', placaB: 'BBB2B22' })
    expect(r.status).toBe(200)
    expect(r.json?.modo).toBe('mutua')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const corpos = fetchMock.mock.calls.map(c => JSON.parse((c[1] as { body: string }).body))
    expect(corpos).toContainEqual({ data: '2026-10-13', placaDe: 'AAA1A11', placaPara: 'BBB2B22', nfs: ['NF-A'] })
    expect(corpos).toContainEqual({ data: '2026-10-13', placaDe: 'BBB2B22', placaPara: 'AAA1A11', nfs: ['NF-B'] })
  })

  it('substituir: 1 movimento A->B com as NFs de A', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, pontos: 1 })))
    vi.stubGlobal('fetch', fetchMock)
    const r = await post({ modo: 'substituir', placaEscala: 'AAA1A11', placaB: 'BBB2B22' })
    expect(r.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body)).toEqual({ data: '2026-10-13', placaDe: 'AAA1A11', placaPara: 'BBB2B22', nfs: ['NF-A'] })
  })

  it('redirecionar sem NFs da carga -> 409 (não move placa inteira)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })))
    vi.stubGlobal('fetch', fetchMock)
    const r = await post({ modo: 'redirecionar', carga: 'CARGA-INEXISTENTE', placaEscala: 'AAA1A11', placaReal: 'BBB2B22' })
    expect(r.status).toBe(409)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
