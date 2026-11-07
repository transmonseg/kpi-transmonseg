import { describe, it, expect, beforeEach, vi } from 'vitest'
import { entregasParaPresenca, enviarPresencaAoMonitoramento } from './presenca-monitoramento'

describe('entregas do Ao vivo -> presenca no monitoramento', () => {
  beforeEach(() => { process.env.MOTOR_SECRET = 'segredo'; process.env.MONITORAMENTO_URL = 'http://mon' })

  it('so manda nota entregue, com placa e chegada', () => {
    const r = entregasParaPresenca({ placas: [
      { placa: 'RQU1B50', nfs: [
        { nf: '1', situacao: 'entregue', chegada: '10:15' },
        { nf: '2', situacao: 'revisar', chegada: null },
        { nf: '3', situacao: 'sem_rastreador' },
        { nf: '4', situacao: 'entregue' },
        { nf: 'SEMNF-101689-146345', situacao: 'entregue', chegada: '11:00' },
      ] },
      { placa: '', nfs: [{ nf: '9', situacao: 'entregue' }] },
    ] })
    expect(r).toEqual([
      { nf: '1', placa: 'RQU1B50', chegada: '10:15' },
      { nf: '4', placa: 'RQU1B50', chegada: null },
    ])
    expect(entregasParaPresenca(null)).toEqual([])
  })

  it('posta na ponte com a chave e devolve quantas gravou', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ ok: true, gravadas: 3 })))
    const r = await enviarPresencaAoMonitoramento('2026-11-06', [{ nf: '1', placa: 'X', chegada: null }], f as unknown as typeof fetch)
    expect(r).toEqual({ ok: true, gravadas: 3 })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://mon/api/romaneio/presenca-kpi')
    expect((init.headers as Record<string, string>)['x-motor-key']).toBe('segredo')
    expect(JSON.parse(init.body as string)).toEqual({ data: '2026-11-06', entregas: [{ nf: '1', placa: 'X', chegada: null }] })
  })

  it('falha de rede nao lanca', async () => {
    const f = vi.fn(async () => { throw new Error('ECONNREFUSED') })
    expect(await enviarPresencaAoMonitoramento('2026-11-06', [{ nf: '1', placa: 'X', chegada: null }], f as unknown as typeof fetch))
      .toEqual({ ok: false, erro: 'ECONNREFUSED' })
  })
})
