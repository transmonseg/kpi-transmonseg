// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { linhasParaMonitoramentoRQ, enviarRioQualityAoMonitoramento, buscarCoordenadasMonitoramentoRQ, contarRioQualityNoMonitoramento, resumoEnvioRQ } from './enviar-monitoramento-rq'
import type { EntregaRioQualityCompleta } from './parse-planilhas'

const entrega = (over: Partial<EntregaRioQualityCompleta>): EntregaRioQualityCompleta => ({
  placaNorm: 'RQU8A12', clienteNome: 'LOJA A', cidade: 'RIO DE JANEIRO', uf: 'RJ',
  destino: '', motorista: '', rua: 'RUA X, 1', bairro: 'CENTRO', nf: '123', clienteCodigo: '123',
  romaneio: '1', rota: '', gabarito: { status: 'Pendente', checkIn: false, checkOut: false, dataCheckIn: null, dataCheckOut: null, motivoDevolucao: null },
  ...over,
})

describe('linhasParaMonitoramentoRQ', () => {
  // F2-02 (GEO-21): o texto "RUA, CIDADE - RJ" fazia o parser do monitoramento
  // ler a cidade como numero. Vai estruturado + o texto que o parser le (o
  // mesmo que o KPI geocodifica), e o pedido ERP como chave interna (D-21b).
  it('monta campos estruturados, endereco no formato do parser e descarta sem placa ou sem NF', () => {
    const r = linhasParaMonitoramentoRQ([
      entrega({ placaNorm: 'LUI1G55', nf: '6079976', pedidoErp: '6079976', clienteCodigo: '6079976', clienteNome: 'ELIZABETH DE ABREU LEITE ALMEIDA', rua: 'AVENIDA SERGIPE', bairro: '', cidade: 'RESENDE' }),
      entrega({ placaNorm: '', nf: '9' }),
      entrega({ placaNorm: 'RQV9Z99', nf: undefined }),
    ])
    expect(r).toEqual([{
      placa: 'LUI1G55', nf: '6079976', pedidoErp: '6079976', clienteCodigo: '6079976', clienteNome: 'ELIZABETH DE ABREU LEITE ALMEIDA',
      rua: 'AVENIDA SERGIPE', numero: null, bairro: '', cidade: 'RESENDE', uf: 'RJ', cep: null,
      enderecoBruto: 'AVENIDA SERGIPE, - , RESENDE - RJ',
    }])
  })

  it('NF repetida ganha o mesmo sufixo do KPI (montarLinhasRomaneioCompleto), contando tambem as sem placa', () => {
    const r = linhasParaMonitoramentoRQ([
      entrega({ placaNorm: '', nf: '5' }),
      entrega({ placaNorm: 'AAA1A11', nf: '5' }),
    ])
    expect(r.map(l => l.nf)).toEqual(['5-2'])
  })

  it('leva a coordenada que o KPI ja resolveu para o endereco', () => {
    const coords = new Map([['RUA X, 1, - CENTRO, RIO DE JANEIRO - RJ', { lat: -22.9, lng: -43.2 }]])
    const [l] = linhasParaMonitoramentoRQ([entrega({})], coords)
    expect(l).toMatchObject({ enderecoBruto: 'RUA X, 1, - CENTRO, RIO DE JANEIRO - RJ', lat: -22.9, lng: -43.2 })
  })
})

describe('enviarRioQualityAoMonitoramento', () => {
  beforeEach(() => { process.env.MOTOR_SECRET = 's'; process.env.MONITORAMENTO_URL = 'http://mon' })
  afterEach(() => vi.unstubAllGlobals())

  it('faz o POST certo (quem enviou + modo substituir) e devolve ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, linhasInseridas: 2, linhasDoDia: 2 })))
    vi.stubGlobal('fetch', fetchMock)
    const linha = { placa: 'A', nf: '1', pedidoErp: null, clienteCodigo: '', clienteNome: '', rua: 'R', numero: null, bairro: '', cidade: 'C', uf: 'RJ', cep: null, enderecoBruto: 'R, - , C - RJ' }
    const r = await enviarRioQualityAoMonitoramento('2026-10-13', [linha], { enviadoPor: 'erica@x.com' })
    expect(r).toEqual({ ok: true, linhasInseridas: 2, linhasDoDia: 2 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://mon/api/romaneio/rioquality')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((init as any).headers['x-motor-key']).toBe('s')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((init as any).headers['x-enviado-por']).toBe('erica@x.com')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(JSON.parse((init as any).body)).toEqual({ data: '2026-10-13', modo: 'substituir', linhas: [linha] })
  })

  it('cabecalho sem caractere fora do latin1 (fetch recusa) e cron-fusion por padrao', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })))
    vi.stubGlobal('fetch', fetchMock)
    await enviarRioQualityAoMonitoramento('2026-10-13', [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((fetchMock.mock.calls[0][1] as any).headers['x-enviado-por']).toBe('cron-fusion')
  })

  it('revisao F2-04-a: devolve linhasApagadas e o aviso de substituicao recusada (antes só o erro era visto)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true, linhasInseridas: 0, linhasApagadas: 0, linhasDoDia: 2824, substituicaoRecusada: true,
      aviso: 'envio sem linhas: as 2824 NFs da RQ do dia nao foram apagadas',
    }))))
    const r = await enviarRioQualityAoMonitoramento('2026-10-23', [])
    expect(r).toMatchObject({ ok: true, linhasApagadas: 0, linhasDoDia: 2824, aviso: 'envio sem linhas: as 2824 NFs da RQ do dia nao foram apagadas' })
  })

  it('fail-open: não lança se o fetch falha', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('rede')))
    const r = await enviarRioQualityAoMonitoramento('2026-10-13', [])
    expect(r.ok).toBe(false)
    expect(r.erro).toContain('rede')
  })
})

describe('resumoEnvioRQ (revisao F2-04-a: apagar e recusar nao sao mais silenciosos)', () => {
  it('erro, aviso e linhas apagadas viram linha de log; envio limpo nao', () => {
    expect(resumoEnvioRQ('2026-10-23', { ok: false, erro: 'HTTP 500' })).toBe('monitoramento RQ 2026-10-23: erro HTTP 500')
    expect(resumoEnvioRQ('2026-10-23', { ok: true, linhasApagadas: 0, aviso: 'envio sem linhas' })).toBe('monitoramento RQ 2026-10-23: substituir recusado -- envio sem linhas')
    expect(resumoEnvioRQ('2026-10-23', { ok: true, linhasApagadas: 37, linhasDoDia: 2824 })).toBe('monitoramento RQ 2026-10-23: 37 linha(s) apagada(s) (dia com 2824)')
    expect(resumoEnvioRQ('2026-10-23', { ok: true, linhasApagadas: 0, linhasDoDia: 2824 })).toBeNull()
    expect(resumoEnvioRQ('2026-10-23', { ok: true })).toBeNull()
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

describe('contarRioQualityNoMonitoramento', () => {
  beforeEach(() => { process.env.MOTOR_SECRET = 's'; process.env.MONITORAMENTO_URL = 'http://mon' })
  afterEach(() => vi.unstubAllGlobals())

  it('conta as linhas da RQ do dia (frota + sem veiculo da ponte)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: '2026-10-23', linhas: 2824 })))
    vi.stubGlobal('fetch', fetchMock)
    expect(await contarRioQualityNoMonitoramento('2026-10-23')).toBe(2824)
    expect(fetchMock.mock.calls[0][0]).toBe('http://mon/api/romaneio/contagem?data=2026-10-23&cod=598&rq=1')
  })

  it('erro ou resposta estranha: null (nao sabe, nao decide)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('x', { status: 500 })))
    expect(await contarRioQualityNoMonitoramento('2026-10-23')).toBeNull()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('rede')))
    expect(await contarRioQualityNoMonitoramento('2026-10-23')).toBeNull()
  })
})
