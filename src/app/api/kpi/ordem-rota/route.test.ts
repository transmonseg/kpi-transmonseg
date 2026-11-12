import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { NextRequest } from 'next/server'

const est = vi.hoisted(() => ({ guardou: null as null | { cliente: string; linhas: number; email: string | null }, ok: true, sync: { situacao: 'ok', nfs: 9 } as { situacao: string; nfs?: number; erro?: string }, syncDia: '' }))
vi.mock('../ao-vivo/acesso', () => ({
  acessoAoVivo: async () => (est.ok ? { ok: true, cliente: 'rioquality', email: 'ana@x', clientes: ['rioquality'] } : { ok: false, resp: new Response('Sem permissão.', { status: 403 }) }),
}))
vi.mock('@/lib/kpi-romaneio/ordem-rota-servidor', () => ({
  guardarOrdemRota: async (cliente: string, _d: string, linhas: unknown[], email: string | null) => { est.guardou = { cliente, linhas: linhas.length, email }; return ['2026-11-12'] },
  sincronizarOrdemRotaFusion: async (d: string) => { est.syncDia = d; return est.sync },
}))
vi.mock('@/lib/kpi-romaneio/relatorio-ordem-rota-servidor', () => ({ periodoValido: () => ({ de: 'x', ate: 'x' }), relatorioOrdemRota: async () => ({}) }))
import { POST } from './route'

const fixture = readFileSync(join(__dirname, '../../../../lib/kpi-rioquality/__fixtures__/relatorio-ordem-rota.xlsx'))
const req = (arquivo?: Blob) => {
  const fd = new FormData()
  if (arquivo) fd.set('arquivo', arquivo, 'Relatório de Entregas.xlsx')
  return new NextRequest('http://x/api/kpi/ordem-rota', { method: 'POST', body: fd })
}

describe('POST /api/kpi/ordem-rota (subir o relatório)', () => {
  beforeEach(() => { est.guardou = null; est.ok = true })
  it('lê o relatório e guarda a ordem com o e-mail de quem subiu', async () => {
    const r = await POST(req(new Blob([new Uint8Array(fixture)])))
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true, nfs: 74, placas: 3, dias: ['2026-11-12'] })
    expect(est.guardou).toEqual({ cliente: 'rioquality', linhas: 74, email: 'ana@x' })
  })
  it('arquivo errado: 422 com explicação, nada gravado', async () => {
    const r = await POST(req(new Blob(['nao e planilha'])))
    expect(r.status).toBe(422)
    expect(await r.text()).toMatch(/ORDEM/)
    expect(est.guardou).toBeNull()
  })
  it('sem arquivo: 400; sem permissão: 403', async () => {
    expect((await POST(req())).status).toBe(400)
    est.ok = false
    expect((await POST(req(new Blob([new Uint8Array(fixture)])))).status).toBe(403)
  })
})

describe('POST ?fusion=AAAA-MM-DD (buscar agora na Fusion)', () => {
  beforeEach(() => { est.ok = true })
  const pedir = (q: string) => POST(new NextRequest(`http://x/api/kpi/ordem-rota?fusion=${q}`, { method: 'POST' }))
  it('busca o dia pedido e responde as notas', async () => {
    est.sync = { situacao: 'ok', nfs: 9 }
    const r = await pedir('2026-11-11')
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true, nfs: 9, dias: ['2026-11-11'], fonte: 'fusion' })
    expect(est.syncDia).toBe('2026-11-11')
  })
  it('Fusion fora: 502 com o motivo; sem cargas: 404; data ruim: 400', async () => {
    est.sync = { situacao: 'erro', erro: 'timeout' }
    expect((await pedir('2026-11-11')).status).toBe(502)
    est.sync = { situacao: 'sem_dados' }
    expect((await pedir('2026-11-11')).status).toBe(404)
    expect((await pedir('2099-01-01')).status).toBe(400)
  })
})
