import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest'

const est = vi.hoisted(() => ({ guardado: null as null | Record<string, unknown>, gravou: null as null | Record<string, unknown>, monitoramento: [] as string[], dataPdf: null as null | string, escala: [{ carga: 'ESC' }] as { carga: string }[], cargasRomaneio: null as null | string[], cliente: 'nutrimax', entregasRQ: [] as Record<string, unknown>[], envioRQ: null as null | { data: string; linhas: unknown[]; opcoes: unknown }, ordem: [] as string[] }))
vi.mock('../acesso', () => ({ acessoAoVivo: async () => ({ ok: true, cliente: est.cliente, email: 'erica@x.com' }) }))
vi.mock('@/lib/data-br', () => ({ hojeBR: () => '2026-10-09' }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: est.guardado }) }) }) }) }) }) }))
vi.mock('@/lib/kpi-romaneio/parse-romaneio', () => ({ parseRomaneioComData: async () => ({ linhas: est.cargasRomaneio ? est.cargasRomaneio.map(carga => ({ carga, nf: carga, placa: 'AAA1A11' })) : [{ nf: 'NOVA', placa: 'AAA1A11' }], data: est.dataPdf }) }))
vi.mock('@/lib/kpi-romaneio/parse-escala', () => ({ parseEscala: async () => est.escala, dataImpressaEscala: async () => '2026-10-16' }))
vi.mock('@/lib/kpi-romaneio/parse-pao', () => ({ parsePao: async () => ({ linhas: [{ nf: 'PAO', placa: 'BBB2B22' }], escala: [{ carga: 'PAO-1' }] }) }))
vi.mock('@/lib/kpi-romaneio/ao-vivo-servico', () => ({
  guardarDiaAoVivo: async (p: Record<string, unknown>) => { est.gravou = p; est.ordem.push('guardar') },
  calcularAoVivo: async () => {},
}))
vi.mock('@/lib/kpi-romaneio/enviar-monitoramento', () => ({ enviarAoMonitoramento: async (a: { origem: string }[]) => { est.monitoramento = a.map(x => x.origem); return [] } }))
vi.mock('@/lib/kpi-rioquality/parse-planilhas', () => ({ parseEntregasCompletas: () => est.entregasRQ }))
vi.mock('@/lib/kpi-rioquality/enviar-monitoramento-rq', () => ({
  linhasComCoordenadasRQ: async (e: Record<string, unknown>[]) => e.map(x => ({ placa: x.placaNorm, nf: x.nf, lat: -22.82, lng: -43.0 })),
  enviarRioQualityAoMonitoramento: async (data: string, linhas: unknown[], opcoes: unknown) => { est.envioRQ = { data, linhas, opcoes }; est.ordem.push('enviar'); return { ok: true, linhasInseridas: linhas.length } },
}))

import { POST } from './route'

const pdf = (n: string) => new File(['%PDF'], n, { type: 'application/pdf' })
const req = (arq: Record<string, File>) => { const fd = new FormData(); fd.set('cliente', 'nutrimax'); for (const [k, v] of Object.entries(arq)) fd.set(k, v); return new Request('http://x/api/kpi/ao-vivo/romaneio', { method: 'POST', body: fd }) as never }
const DIA = { romaneio: [{ nf: 'R1', placa: 'AAA1A11' }], escala: [{ carga: 'E1' }], pao: { linhas: [{ nf: 'P1', placa: 'BBB2B22' }], escala: [] }, escala_enviada: true, pao_enviado: false }

describe('POST /api/kpi/ao-vivo/romaneio (arquivo esquecido, 08/10)', () => {
  beforeEach(() => { est.guardado = null; est.gravou = null; est.monitoramento = []; est.dataPdf = null; est.escala = [{ carga: 'ESC' }]; est.cargasRomaneio = null })

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
  // KP-03 (auditoria 15/10): 11/10 subiu o PDF de 10/10 e virou KPI oficial.
  it('romaneio com data de OUTRO dia no cabecalho: 422, nada e gravado nem enviado ao monitoramento', async () => {
    est.dataPdf = '2026-10-08'
    const r = await POST(req({ romaneio: pdf('rom.pdf') }))
    expect(r.status).toBe(422)
    expect(await r.text()).toMatch(/08\/10\/2026.*09\/10\/2026/)
    expect(est.gravou).toBeNull()
    expect(est.monitoramento).toEqual([])
  })

  it('romaneio com a data de hoje: aceito', async () => {
    est.dataPdf = '2026-10-09'
    const r = await POST(req({ romaneio: pdf('rom.pdf') }))
    expect(r.status).toBe(200)
  })

  it('PDF sem data legivel continua aceito (nao bloqueia)', async () => {
    est.dataPdf = null
    const r = await POST(req({ romaneio: pdf('rom.pdf') }))
    expect(r.status).toBe(200)
  })
})

// F1-13 (ING-07): escala vazia ou de outro dia nao e' mais aceita calada.
describe('POST /api/kpi/ao-vivo/romaneio -- Escala de Rota conferida (F1-13)', () => {
  const R17 = ['100297', '100299', '100300', '100301']
  beforeEach(() => { est.guardado = null; est.gravou = null; est.monitoramento = []; est.dataPdf = null; est.cargasRomaneio = null })

  it('PDF da Porto Frio na caixa de escala (0 linhas): 422, nada gravado', async () => {
    est.guardado = { ...DIA, romaneio: R17.map(carga => ({ carga, nf: carga, placa: 'AAA1A11' })) }
    est.escala = []
    const r = await POST(req({ escala: pdf('Escala de rotas 21-10.pdf') }))
    expect(r.status).toBe(422)
    expect(await r.text()).toMatch(/nenhuma carga/)
    expect(est.gravou).toBeNull()
  })

  it('escala de 16/10 com o romaneio de 17/10: 422 mostrando a data impressa, nada gravado nem enviado', async () => {
    est.cargasRomaneio = R17
    est.escala = ['100208', '100213', '100211', '100214'].map(carga => ({ carga }))
    const r = await POST(req({ romaneio: pdf('rom.pdf'), escala: pdf('escala.pdf') }))
    expect(r.status).toBe(422)
    const t = await r.text()
    expect(t).toContain('0 de 4')
    expect(t).toContain('16/10/2026')
    expect(est.gravou).toBeNull()
    expect(est.monitoramento).toEqual([])
  })

  it('escala certa do dia: aceita e marcada como enviada', async () => {
    est.cargasRomaneio = R17
    est.escala = R17.slice(0, 3).map(carga => ({ carga }))
    const r = await POST(req({ romaneio: pdf('rom.pdf'), escala: pdf('escala.pdf') }))
    expect(r.status).toBe(200)
    expect(est.gravou).toMatchObject({ escalaEnviada: true })
  })
})


// F2-04 (KRQ-03, MON-01, AC-04): em 21/10 a planilha da RQ subida as 15:01
// nunca chegou ao monitoramento (0 pontos, 0 alertas o dia todo).
describe('POST /api/kpi/ao-vivo/romaneio -- Rio Quality vai ao monitoramento (F2-04)', () => {
  beforeEach(() => { est.cliente = 'rioquality'; est.envioRQ = null; est.gravou = null; est.ordem = [] })
  afterAll(() => { est.cliente = 'nutrimax' })
  const xlsx = () => new File(['x'], 'entregas.xlsx')
  const reqRQ = () => { const fd = new FormData(); fd.set('cliente', 'rioquality'); fd.set('completo', xlsx()); return new Request('http://x/api/kpi/ao-vivo/romaneio', { method: 'POST', body: fd }) as never }

  it('guarda o dia e envia ao monitoramento com o e-mail de quem subiu e a coordenada resolvida', async () => {
    est.entregasRQ = [{ placaNorm: 'LNH9C10', nf: '5557757', pedidoErp: '6081346', rua: 'RUA IMBOASSU' }]
    const r = await POST(reqRQ())
    expect(r.status).toBe(200)
    expect(est.ordem).toEqual(['guardar', 'enviar'])
    expect(est.envioRQ).toEqual({ data: '2026-10-09', linhas: [{ placa: 'LNH9C10', nf: '5557757', lat: -22.82, lng: -43.0 }], opcoes: { enviadoPor: 'erica@x.com' } })
    expect(await r.json()).toMatchObject({ ok: true, nfs: 1, monitoramento: [{ origem: 'romaneio', ok: true }] })
  })

  it('planilha sem entregas: 422 e nada vai ao monitoramento', async () => {
    est.entregasRQ = []
    const r = await POST(reqRQ())
    expect(r.status).toBe(422)
    expect(est.envioRQ).toBeNull()
  })
})
