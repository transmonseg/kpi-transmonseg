// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { linhasParaMonitoramentoRQ, enviarRioQualityAoMonitoramento, buscarCoordenadasMonitoramentoRQ } from './enviar-monitoramento-rq'
import type { EntregaRioQualityCompleta } from './parse-planilhas'

const entrega = (over: Partial<EntregaRioQualityCompleta>): EntregaRioQualityCompleta => ({
  placaNorm: 'RQU8A12', clienteNome: 'LOJA A', cidade: 'RIO DE JANEIRO', uf: 'RJ',
  destino: '', motorista: '', rua: 'RUA X, 1', bairro: 'CENTRO', nf: '123', clienteCodigo: '123',
  romaneio: '1', rota: '', gabarito: { status: 'Pendente', checkIn: false, checkOut: false, dataCheckIn: null, dataCheckOut: null, motivoDevolucao: null },
  ...over,
})

describe('linhasParaMonitoramentoRQ', () => {
  it('monta placa/nf/endereço e descarta sem placa ou sem NF', () => {
    const r = linhasParaMonitoramentoRQ([
      entrega({}),
      entrega({ placaNorm: '', nf: '9' }),
      entrega({ placaNorm: 'RQV9Z99', nf: undefined }),
    ])
    expect(r).toHaveLength(1)
    expect(r[0]).toEqual({ placa: 'RQU8A12', nf: '123', clienteCodigo: '123', clienteNome: 'LOJA A', enderecoBruto: 'RUA X, 1, CENTRO, RIO DE JANEIRO - RJ' })
  })
})

describe('enviarRioQualityAoMonitoramento', () => {
  beforeEach(() => { process.env.MOTOR_SECRET = 's'; process.env.MONITORAMENTO_URL = 'http://mon' })
  afterEach(() => vi.unstubAllGlobals())

  it('faz o POST certo e devolve ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, linhasInseridas: 2 })))
    vi.stubGlobal('fetch', fetchMock)
    const r = await enviarRioQualityAoMonitoramento('2026-10-13', [{ placa: 'A', nf: '1', clienteCodigo: '', clienteNome: '', enderecoBruto: 'x' }])
    expect(r).toEqual({ ok: true, linhasInseridas: 2 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://mon/api/romaneio/rioquality')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((init as any).headers['x-motor-key']).toBe('s')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(JSON.parse((init as any).body)).toEqual({ data: '2026-10-13', linhas: [{ placa: 'A', nf: '1', clienteCodigo: '', clienteNome: '', enderecoBruto: 'x' }] })
  })

  it('fail-open: não lança se o fetch falha', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('rede')))
    const r = await enviarRioQualityAoMonitoramento('2026-10-13', [])
    expect(r.ok).toBe(false)
    expect(r.erro).toContain('rede')
  })
})

describe('buscarCoordenadasMonitoramentoRQ', () => {
  beforeEach(() => { process.env.MOTOR_SECRET = 's'; process.env.MONITORAMENTO_URL = 'http://mon' })
  afterEach(() => vi.unstubAllGlobals())

  it('devolve mapa placaNorm|nf -> coord e ignora pontos sem lat', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ pontos: [
      { placa: 'rqu8a12', nf: '123', lat: -22.9, lng: -43.1 },
      { placa: 'RQV9Z99', nf: '9', lat: null, lng: -43 },
    ] }))))
    const m = await buscarCoordenadasMonitoramentoRQ('2026-10-13')
    expect(m.get('RQU8A12|123')).toEqual({ lat: -22.9, lng: -43.1 })
    expect(m.size).toBe(1)
  })

  it('fail-open: mapa vazio se o fetch falha', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('rede')))
    const m = await buscarCoordenadasMonitoramentoRQ('2026-10-13')
    expect(m.size).toBe(0)
  })
})
