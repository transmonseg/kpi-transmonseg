import { describe, expect, it, vi, beforeEach } from 'vitest'

const est = vi.hoisted(() => ({ guardado: null as null | Record<string, unknown>, gravou: null as null | Record<string, unknown>, monitoramento: [] as string[] }))
vi.mock('../acesso', () => ({ acessoAoVivo: async () => ({ ok: true, cliente: 'nutrimax', email: 'erica@x.com' }) }))
vi.mock('@/lib/data-br', () => ({ hojeBR: () => '2026-10-09' }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: est.guardado }) }) }) }) }) }) }))
vi.mock('@/lib/kpi-romaneio/parse-romaneio', () => ({ parseRomaneio: async () => [{ nf: 'NOVA', placa: 'AAA1A11' }] }))
vi.mock('@/lib/kpi-romaneio/parse-escala', () => ({ parseEscala: async () => [{ carga: 'ESC' }] }))
vi.mock('@/lib/kpi-romaneio/parse-pao', () => ({ parsePao: async () => ({ linhas: [{ nf: 'PAO', placa: 'BBB2B22' }], escala: [{ carga: 'PAO-1' }] }) }))
vi.mock('@/lib/kpi-romaneio/ao-vivo-servico', () => ({
  guardarDiaAoVivo: async (p: Record<string, unknown>) => { est.gravou = p },
  calcularAoVivo: async () => {},
}))
vi.mock('@/lib/kpi-romaneio/enviar-monitoramento', () => ({ enviarAoMonitoramento: async (a: { origem: string }[]) => { est.monitoramento = a.map(x => x.origem); return [] } }))
vi.mock('@/lib/kpi-rioquality/parse-planilhas', () => ({ parseEntregasCompletas: () => [] }))

import { POST } from './route'

const pdf = (n: string) => new File(['%PDF'], n, { type: 'application/pdf' })
const req = (arq: Record<string, File>) => { const fd = new FormData(); fd.set('cliente', 'nutrimax'); for (const [k, v] of Object.entries(arq)) fd.set(k, v); return new Request('http://x/api/kpi/ao-vivo/romaneio', { method: 'POST', body: fd }) as never }
const DIA = { romaneio: [{ nf: 'R1', placa: 'AAA1A11' }], escala: [{ carga: 'E1' }], pao: { linhas: [{ nf: 'P1', placa: 'BBB2B22' }], escala: [] }, escala_enviada: true, pao_enviado: false }

describe('POST /api/kpi/ao-vivo/romaneio (arquivo esquecido, 08/10)', () => {
  beforeEach(() => { est.guardado = null; est.gravou = null; est.monitoramento = [] })

  it('esqueceu o pao: manda so\' o pao depois -- romaneio e escala do dia continuam', async () => {
    est.guardado = DIA
    const r = await POST(req({ romaneioPao: pdf('pao.pdf') }))
    expect(r.status).toBe(200)
    expect(est.gravou).toMatchObject({ romaneio: DIA.romaneio, escala: DIA.escala, paoEnviado: true, escalaEnviada: true })
    expect((est.gravou as { pao: { linhas: { nf: string }[] } }).pao.linhas[0].nf).toBe('PAO')
    expect(est.monitoramento).toEqual(['escala_pao']) // so' o que veio vai pro monitoramento
  })

  it('manda o romaneio de novo sem o pao: o pao que ja tinha NAO e apagado', async () => {
    est.guardado = { ...DIA, pao_enviado: true }
    const r = await POST(req({ romaneio: pdf('rom.pdf') }))
    expect(r.status).toBe(200)
    expect((est.gravou as { romaneio: { nf: string }[] }).romaneio[0].nf).toBe('NOVA')
    expect((est.gravou as { pao: { linhas: unknown[] } }).pao.linhas).toHaveLength(1)
    expect(est.gravou).toMatchObject({ paoEnviado: true, escalaEnviada: true })
  })

  it('primeiro envio do dia sem romaneio: 400 claro', async () => {
    const r = await POST(req({ romaneioPao: pdf('pao.pdf') }))
    expect(r.status).toBe(400)
    expect(await r.text()).toMatch(/Romaneio de Entrega/)
    expect(est.gravou).toBeNull()
  })

  it('sem arquivo nenhum: 400', async () => {
    est.guardado = DIA
    expect((await POST(req({}))).status).toBe(400)
  })
})
