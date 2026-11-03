import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// GEO3-08 (auditoria 03/11): o ponto da Nutry no monitoramento diverge do KPI
// (44,3% a mais de 150 m). A RQ já manda o ponto confiável do cache do KPI; a
// Nutry passa a mandar junto com o PDF (campo "coordenadas", por NF).
vi.mock('./geocode', () => ({
  coordenadasConfiaveisDoCache: vi.fn(async (enderecos: string[]) => new Map(
    enderecos.filter(e => e.startsWith('RUA CONFIAVEL')).map(e => [e, { lat: -22.9, lng: -43.2 }]),
  )),
}))

import { enviarAoMonitoramento, coordenadasNutryParaMonitoramento } from './enviar-monitoramento'
import type { LinhaRomaneio } from './types'

const l = (nf: string, endereco: string, placa = 'RQU5H30'): LinhaRomaneio => ({ carga: '101465', destino: 'X', placa, motorista: 'M', ajudantes: [], nf, clienteCodigo: '1', clienteNome: 'C', endereco })

beforeEach(() => { process.env.MOTOR_SECRET = 'k' })
afterEach(() => { vi.restoreAllMocks(); delete process.env.MOTOR_SECRET })

describe('coordenadasNutryParaMonitoramento', () => {
  it('só as NFs com ponto confiável no cache do KPI, com placa e NF', async () => {
    const c = await coordenadasNutryParaMonitoramento([l('2453742', 'RUA CONFIAVEL, 18 - CENTRO, MARICA'), l('2453743', 'RUA SEM PONTO, 1 - CENTRO, MARICA'), l('2453744', 'RUA CONFIAVEL, 18 - CENTRO, MARICA', 'RQV5F64')])
    expect(c).toEqual([
      { placa: 'RQU5H30', nf: '2453742', lat: -22.9, lng: -43.2 },
      { placa: 'RQV5F64', nf: '2453744', lat: -22.9, lng: -43.2 },
    ])
  })
  it('falha na leitura do cache: vai sem coordenada (o monitoramento geocodifica)', async () => {
    const { coordenadasConfiaveisDoCache } = await import('./geocode')
    vi.mocked(coordenadasConfiaveisDoCache).mockRejectedValueOnce(new Error('banco fora'))
    expect(await coordenadasNutryParaMonitoramento([l('1', 'RUA CONFIAVEL')])).toEqual([])
  })
})

describe('enviarAoMonitoramento com as coordenadas', () => {
  it('o romaneio leva o campo "coordenadas"; o pão não', async () => {
    const corpos: FormData[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_u, init) => { corpos.push((init as RequestInit).body as FormData); return new Response(JSON.stringify({ ok: true, totalLinhas: 1 })) })
    const coordenadas = [{ placa: 'RQU5H30', nf: '2453742', lat: -22.9, lng: -43.2 }]
    await enviarAoMonitoramento([
      { buf: Buffer.from('pdf'), nome: 'r.pdf', origem: 'romaneio', coordenadas },
      { buf: Buffer.from('pdf'), nome: 'p.pdf', origem: 'escala_pao' },
    ], 'ana@x')
    expect(JSON.parse(String(corpos[0].get('coordenadas')))).toEqual(coordenadas)
    expect(corpos[1].get('coordenadas')).toBeNull()
  })
})
