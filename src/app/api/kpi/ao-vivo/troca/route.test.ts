import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../acesso', () => ({
  acessoAoVivo: vi.fn(async (cliente: string | null) => ({ ok: true, cliente, email: 't@t', clientes: ['nutrimax'] })),
}))
vi.mock('@/lib/data-br', () => ({ hojeBR: () => '2026-10-13' }))
vi.mock('@/lib/unitrac-api', () => ({
  buscarFrota: vi.fn(async () => [{ placaNorm: 'AAA1A11' }, { placaNorm: 'BBB2B22' }, { placaNorm: 'TOS5E38' }]),
  normPlaca: (s: string) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''),
}))
const calcular = vi.hoisted(() => vi.fn(async () => 'ok'))
vi.mock('@/lib/kpi-romaneio/ao-vivo-servico', () => ({ calcularAoVivo: calcular }))

// Banco falso por tabela: romaneio do dia (por data) e kpi_troca_placa com
// as linhas configuradas; cada operação fica registrada em `ops`.
type Op = { tabela: string; op: string; filtros: Record<string, unknown>; valor?: unknown }
const db = vi.hoisted(() => ({
  romaneioPorData: {} as Record<string, unknown>,
  trocas: [] as Record<string, unknown>[],
  ops: [] as Op[],
}))
function tabela(nome: string) {
  const reg: Op = { tabela: nome, op: 'select', filtros: {} }
  const resultado = () => {
    if (nome === 'kpi_ao_vivo_dia') return { data: db.romaneioPorData[String(reg.filtros.data)] ?? null, error: null }
    if (reg.op !== 'select') return { data: null, error: null }
    return { data: db.trocas.filter(t => Object.entries(reg.filtros).every(([k, v]) => k === 'empresa' || t[k] === v)), error: null }
  }
  const o: Record<string, unknown> = {
    then: (r: (v: unknown) => unknown) => { db.ops.push(reg); return Promise.resolve(resultado()).then(r) },
    maybeSingle: async () => { db.ops.push(reg); const x = resultado(); return { data: Array.isArray(x.data) ? x.data[0] ?? null : x.data, error: null } },
  }
  for (const m of ['select', 'order', 'limit', 'is', 'in']) o[m] = () => o
  o.eq = (k: string, v: unknown) => { reg.filtros[k] = v; return o }
  for (const m of ['delete', 'insert', 'update']) o[m] = (v?: unknown) => { reg.op = m; reg.valor = v; return o }
  return o
}
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ from: (t: string) => tabela(t) }) }))

const romaneio13 = { romaneio: [{ placa: 'AAA1A11', nf: 'NF-A', carga: 'C1' }, { placa: 'BBB2B22', nf: 'NF-B', carga: 'C2' }], pao: { linhas: [{ placa: '', nf: 'NF-P1', carga: 'PAO-6' }, { placa: '', nf: 'NF-P2', carga: 'PAO-6' }] } }

async function post(body: unknown) {
  const { POST } = await import('./route')
  const res = await POST(new Request('http://x/api/kpi/ao-vivo/troca', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) as never)
  return { status: res.status, json: await res.clone().json().catch(() => null) as Record<string, unknown> | null, texto: await res.text() }
}
const corpos = (f: ReturnType<typeof vi.fn>) => f.mock.calls.map(c => JSON.parse((c[1] as { body: string }).body))
const escritas = () => db.ops.filter(o => o.tabela === 'kpi_troca_placa' && o.op !== 'select')

describe('POST /api/kpi/ao-vivo/troca (modos)', () => {
  beforeEach(() => {
    process.env.MOTOR_SECRET = 's'; process.env.MONITORAMENTO_URL = 'http://mon'
    db.romaneioPorData = { '2026-10-13': romaneio13 }; db.trocas = []; db.ops = []; calcular.mockClear()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('mútua: 2 movimentos com as NFs de cada placa (ordem capturada antes de aplicar)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, pontos: 1 })))
    vi.stubGlobal('fetch', fetchMock)
    const r = await post({ modo: 'mutua', placaEscala: 'AAA1A11', placaB: 'BBB2B22' })
    expect(r.status).toBe(200)
    expect(r.json?.modo).toBe('mutua')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(corpos(fetchMock)).toContainEqual({ data: '2026-10-13', placaDe: 'AAA1A11', placaPara: 'BBB2B22', nfs: ['NF-A'] })
    expect(corpos(fetchMock)).toContainEqual({ data: '2026-10-13', placaDe: 'BBB2B22', placaPara: 'AAA1A11', nfs: ['NF-B'] })
  })

  it('substituir: 1 movimento A->B com as NFs de A', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, pontos: 1 })))
    vi.stubGlobal('fetch', fetchMock)
    const r = await post({ modo: 'substituir', placaEscala: 'AAA1A11', placaB: 'BBB2B22' })
    expect(r.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(corpos(fetchMock)[0]).toEqual({ data: '2026-10-13', placaDe: 'AAA1A11', placaPara: 'BBB2B22', nfs: ['NF-A'] })
  })

  it('redirecionar sem NFs da carga -> 409 e NADA gravado (antes gravava e respondia erro)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })))
    vi.stubGlobal('fetch', fetchMock)
    const r = await post({ modo: 'redirecionar', carga: 'CARGA-INEXISTENTE', placaEscala: 'AAA1A11', placaReal: 'BBB2B22' })
    expect(r.status).toBe(409)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(escritas()).toEqual([])
  })

  // F1-05 (ING-01): o monitoramento antigo respondia ok:true pontos:0 quando
  // nao casava a placa (RQO5E38 x RQO-5E38) e a tela dizia "Troca registrada".
  it('F1-05: monitoramento responde ok com 0 pontos e havia NFs -> monitoramento.ok=false com erro', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, pontos: 0 }))))
    const r = await post({ modo: 'redirecionar', carga: 'C1', placaEscala: 'AAA1A11', placaReal: 'TOS5E38' })
    expect(r.status).toBe(200)
    const m = r.json?.monitoramento as { ok: boolean; erro?: string }
    expect(m.ok).toBe(false)
    expect(m.erro).toMatch(/nenhum ponto/i)
  })

  it('F1-05: monitoramento novo (ok:false, 404) -> erro repassado à tela', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false, pontos: 0, erro: 'as 1 notas de AAA1A11 em 2026-10-13 nao foram encontradas no monitoramento -- nada foi trocado' }), { status: 404 })))
    const r = await post({ modo: 'redirecionar', carga: 'C1', placaEscala: 'AAA1A11', placaReal: 'TOS5E38' })
    expect(r.json?.monitoramento).toEqual({ ok: false, erro: expect.stringMatching(/nao foram encontradas/) })
  })

  it('F1-05: mútua com 0 pontos num lado -> esse movimento sai com ok=false', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, pontos: 1 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, pontos: 0 }))))
    const r = await post({ modo: 'mutua', placaEscala: 'AAA1A11', placaB: 'BBB2B22' })
    const movs = r.json?.movimentos as { monitoramento: { ok: boolean } }[]
    expect(movs.map(m => m.monitoramento.ok)).toEqual([true, false])
  })

  // D-28: "Placas do dia" registra pela MESMA rota, em qualquer dia já passado.
  it('D-28: data de dia passado grava com essa data, lê o romaneio daquele dia e recalcula ele', async () => {
    db.romaneioPorData = { '2026-10-12': { romaneio: [{ placa: 'AAA1A11', nf: 'NF-12', carga: 'C9' }], pao: { linhas: [] } } }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, pontos: 1 })))
    vi.stubGlobal('fetch', fetchMock)
    const r = await post({ modo: 'redirecionar', data: '2026-10-12', carga: 'C9', placaEscala: 'AAA1A11', placaReal: 'BBB2B22' })
    expect(r.status).toBe(200)
    expect(escritas()).toEqual([expect.objectContaining({ op: 'insert', valor: expect.objectContaining({ data: '2026-10-12', carga: 'C9', placa_escala: 'AAA1A11', placa_real: 'BBB2B22' }) })])
    expect(corpos(fetchMock)[0]).toEqual({ data: '2026-10-12', placaDe: 'AAA1A11', placaPara: 'BBB2B22', nfs: ['NF-12'] })
    expect(calcular).toHaveBeenCalledWith('nutrimax', '2026-10-12')
  })

  it('D-28: dia sem romaneio no Ao vivo (antes de 02/10): grava a troca e avisa que o monitoramento não foi atualizado', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const r = await post({ modo: 'redirecionar', data: '2026-09-26', carga: '98808', placaEscala: 'TTI9B98', placaReal: 'BBB2B22' })
    expect(r.status).toBe(200)
    expect(escritas()).toEqual([expect.objectContaining({ op: 'insert', valor: expect.objectContaining({ data: '2026-09-26', carga: '98808' }) })])
    expect(fetchMock).not.toHaveBeenCalled()
    expect(r.json?.monitoramento).toEqual({ ok: false, erro: expect.stringMatching(/sem romaneio/) })
  })

  it('D-28: data no futuro ou inválida -> 400', async () => {
    expect((await post({ modo: 'redirecionar', data: '2026-10-14', carga: 'C1', placaEscala: 'AAA1A11', placaReal: 'BBB2B22' })).status).toBe(400)
    expect((await post({ modo: 'redirecionar', data: '13/10/2026', carga: 'C1', placaEscala: 'AAA1A11', placaReal: 'BBB2B22' })).status).toBe(400)
  })

  // F1-03 (KN-01): carga do pão sem placa -- atribuir a placa que rodou.
  it('F1-03: placa da escala vazia + carga sem placa -> 200, grava placa_escala "" e move do "-" no monitoramento', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, pontos: 2 })))
    vi.stubGlobal('fetch', fetchMock)
    const r = await post({ modo: 'redirecionar', carga: 'PAO-6', placaEscala: '', placaReal: 'TOS5E38' })
    expect(r.status).toBe(200)
    expect(escritas()[0].valor).toEqual(expect.objectContaining({ carga: 'PAO-6', placa_escala: '', placa_real: 'TOS5E38' }))
    expect(corpos(fetchMock)[0]).toEqual({ data: '2026-10-13', placaDe: '', placaPara: 'TOS5E38', nfs: ['NF-P1', 'NF-P2'] })
  })

  it('F1-03: placa da escala vazia sem carga -> 400', async () => {
    expect((await post({ modo: 'redirecionar', carga: '', placaEscala: '', placaReal: 'TOS5E38' })).status).toBe(400)
  })

  it('F1-03: placa da escala vazia numa carga QUE TEM placa -> 400 (não grava)', async () => {
    const r = await post({ modo: 'redirecionar', carga: 'C1', placaEscala: '', placaReal: 'TOS5E38' })
    expect(r.status).toBe(400)
    expect(r.texto).toMatch(/AAA1A11/)
    expect(escritas()).toEqual([])
  })

  // R1 (revisão Fase 1): "Placas do dia" aceita a placa da escala só pelo
  // final ("5J17", exemplo do próprio campo). Antes gravava placa_escala
  // '5J17', que nunca casa com o romaneio (RBG5J17): a troca não valia no KPI.
  it('R1: placa da escala pelo final ("5J17") é completada pela placa da carga no romaneio', async () => {
    db.romaneioPorData = { '2026-10-13': { romaneio: [{ placa: 'RBG5J17', nf: 'NF-700', carga: '100700' }], pao: { linhas: [] } } }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, pontos: 1 })))
    vi.stubGlobal('fetch', fetchMock)
    const r = await post({ modo: 'redirecionar', carga: '100700', placaEscala: '5J17', placaReal: 'TOS5E38' })
    expect(r.status).toBe(200)
    expect(escritas()).toEqual([expect.objectContaining({ op: 'insert', valor: expect.objectContaining({ carga: '100700', placa_escala: 'RBG5J17', placa_real: 'TOS5E38' }) })])
    expect(corpos(fetchMock)[0]).toEqual({ data: '2026-10-13', placaDe: 'RBG5J17', placaPara: 'TOS5E38', nfs: ['NF-700'] })
  })

  it('R1: placa da escala que não é a da carga no romaneio -> 400 citando a placa certa, nada gravado', async () => {
    db.romaneioPorData = { '2026-10-13': { romaneio: [{ placa: 'RBG5J17', nf: 'NF-700', carga: '100700' }], pao: { linhas: [] } } }
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const r = await post({ modo: 'redirecionar', carga: '100700', placaEscala: '9C84', placaReal: 'TOS5E38' })
    expect(r.status).toBe(400)
    expect(r.texto).toMatch(/RBG5J17/)
    expect(escritas()).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('R1: carga que veio sem placa e escala digitada -> 400 (placa_escala nunca casaria com o "-")', async () => {
    const r = await post({ modo: 'redirecionar', carga: 'PAO-6', placaEscala: 'AAA1A11', placaReal: 'TOS5E38' })
    expect(r.status).toBe(400)
    expect(escritas()).toEqual([])
  })

  it('R1: dia sem romaneio no Ao vivo: placa da escala pelo final completa pela frota', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const r = await post({ modo: 'redirecionar', data: '2026-09-26', carga: '98808', placaEscala: '5E38', placaReal: 'BBB2B22' })
    expect(r.status).toBe(200)
    expect(escritas()).toEqual([expect.objectContaining({ op: 'insert', valor: expect.objectContaining({ carga: '98808', placa_escala: 'TOS5E38', placa_real: 'BBB2B22' }) })])
  })

  // D-28: desfazer pela mesma rota (antes "Placas do dia" só apagava a linha
  // do KPI e o monitoramento ficava com as NFs no carro trocado).
  it('desfazer por id: apaga a troca e devolve as NFs da carga ao carro da escala', async () => {
    db.trocas = [{ id: 7, empresa: 'NUTRY MAX', data: '2026-10-13', carga: 'C1', placa_escala: 'AAA1A11', placa_real: 'BBB2B22' }]
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, pontos: 1 })))
    vi.stubGlobal('fetch', fetchMock)
    const r = await post({ modo: 'desfazer', id: 7 })
    expect(r.status).toBe(200)
    expect(escritas()).toEqual([expect.objectContaining({ op: 'delete', filtros: expect.objectContaining({ id: 7 }) })])
    expect(corpos(fetchMock)[0]).toEqual({ data: '2026-10-13', placaDe: 'BBB2B22', placaPara: 'AAA1A11', nfs: ['NF-A'] })
    expect(calcular).toHaveBeenCalledWith('nutrimax', '2026-10-13')
  })

  it('desfazer troca de placa inteira (sem carga): NFs da placa da escala voltam', async () => {
    db.trocas = [{ id: 8, empresa: 'NUTRY MAX', data: '2026-10-13', carga: null, placa_escala: 'BBB2B22', placa_real: 'AAA1A11' }]
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, pontos: 1 })))
    vi.stubGlobal('fetch', fetchMock)
    await post({ modo: 'desfazer', id: 8 })
    expect(corpos(fetchMock)[0]).toEqual({ data: '2026-10-13', placaDe: 'AAA1A11', placaPara: 'BBB2B22', nfs: ['NF-B'] })
  })

  it('desfazer atribuição de carga sem placa: apaga e avisa que o monitoramento não volta pro "-"', async () => {
    db.trocas = [{ id: 9, empresa: 'NUTRY MAX', data: '2026-10-13', carga: 'PAO-6', placa_escala: '', placa_real: 'TOS5E38' }]
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const r = await post({ modo: 'desfazer', id: 9 })
    expect(r.status).toBe(200)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(r.json?.monitoramento).toEqual({ ok: false, erro: expect.stringMatching(/TOS5E38/) })
  })

  it('desfazer id inexistente -> 404', async () => {
    expect((await post({ modo: 'desfazer', id: 99 })).status).toBe(404)
  })
})
