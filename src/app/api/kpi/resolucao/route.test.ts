import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// F3-03 (ACH-02, KN-11): a fila "Conferir" grava em kpi_nf_resolucao pela
// mesma registrarResolucao do importador, com o responsável logado. Só
// operador e admin (acessoAoVivo); entrega só com comprovante (D-07).

const acesso = vi.fn()
vi.mock('../ao-vivo/acesso', () => ({ acessoAoVivo: (c: string | null) => acesso(c) }))
vi.mock('@/lib/data-br', () => ({ hojeBR: () => '2026-10-24' }))
const registrar = vi.fn()
const buscar = vi.fn()
vi.mock('@/lib/kpi-romaneio/resolucoes', async (orig) => ({
  ...(await orig<typeof import('@/lib/kpi-romaneio/resolucoes')>()),
  registrarResolucao: (...a: unknown[]) => registrar(...a),
  buscarResolucoes: (...a: unknown[]) => buscar(...a),
}))
const nfDoDia = vi.fn()
const guardar = vi.fn()
const apagar = vi.fn()
vi.mock('@/lib/kpi-romaneio/conferencia-servico', () => ({
  nfDoDia: (...a: unknown[]) => nfDoDia(...a),
  guardarComprovante: (...a: unknown[]) => guardar(...a),
  apagarComprovante: (...a: unknown[]) => apagar(...a),
}))

const OK = (cliente: string) => ({ ok: true, cliente, email: 'erica@transmonseg.com.br', clientes: ['nutrimax', 'rioquality'] })
const NF_2210 = { placa: 'RQV5F64', nf: { nf: '2437979', carga: '100700', situacao: 'revisar', status: 'PARADA DE OUTRO CLIENTE - NÃO CONFIRMA ESTE CLIENTE - CONFERIR' } }

function post(campos: Record<string, string | File>, cliente = 'nutrimax') {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.append(k, v)
  return new NextRequest(`http://x/api/kpi/resolucao?cliente=${cliente}`, { method: 'POST', body: fd })
}
const foto = () => new File([new Uint8Array(2048)], 'canhoto.jpg', { type: 'image/jpeg' })

beforeEach(() => {
  for (const f of [acesso, registrar, buscar, nfDoDia, guardar, apagar]) f.mockReset()
  acesso.mockImplementation(async (c: string | null) => OK(c ?? ''))
  nfDoDia.mockResolvedValue(NF_2210)
  guardar.mockResolvedValue(undefined)
  registrar.mockImplementation(async (n: Record<string, unknown>) => ({ id: 41, criado_em: '2026-10-24T12:00:00Z', ...n }))
})

describe('POST /api/kpi/resolucao', () => {
  it('"Entregue — tenho comprovante": guarda o anexo e grava entregue com o responsável', async () => {
    const { POST } = await import('./route')
    const res = await POST(post({ data: '2026-10-22', nf: '2437979', acao: 'comprovante', observacao: 'canhoto assinado', comprovante: foto() }))
    expect(res.status).toBe(200)
    expect(guardar).toHaveBeenCalledTimes(1)
    const caminho = guardar.mock.calls[0][0] as string
    expect(caminho).toMatch(/^comprovantes\/nutrimax\/2026-10-22\/2437979-\d+-[a-z0-9]+\.jpg$/)
    expect(registrar).toHaveBeenCalledWith({
      empresa: 'NUTRY MAX', data: '2026-10-22', nf: '2437979', resolucao: 'entregue', placa_executora: null,
      observacao: 'canhoto assinado', responsavel: 'erica@transmonseg.com.br', documento: caminho,
    })
    const j = await res.json()
    expect(j.resolucao).toMatchObject({ id: 41, nf: '2437979', resolucao: 'entregue', temComprovante: true })
    expect(JSON.stringify(j)).not.toContain('comprovantes/')
  })

  it('entregue sem anexo não grava (D-07)', async () => {
    const { POST } = await import('./route')
    const res = await POST(post({ data: '2026-10-22', nf: '2437979', acao: 'comprovante' }))
    expect(res.status).toBe(400)
    expect(await res.text()).toContain('Anexe')
    expect(registrar).not.toHaveBeenCalled()
    expect(guardar).not.toHaveBeenCalled()
  })

  it('"Entregue por outra placa" exige a placa e grava a placa executora', async () => {
    const { POST } = await import('./route')
    expect((await POST(post({ data: '2026-10-22', nf: '2437979', acao: 'outra_placa', comprovante: foto() }))).status).toBe(400)
    const res = await POST(post({ data: '2026-10-22', nf: '2437979', acao: 'outra_placa', placaExecutora: 'rqv-5f67', comprovante: foto() }))
    expect(res.status).toBe(200)
    expect(registrar.mock.calls[0][0]).toMatchObject({ resolucao: 'entregue_outra_placa', placa_executora: 'RQV5F67' })
  })

  it('"Não esteve no local" e "Ponto do cliente errado" gravam sem anexo', async () => {
    const { POST } = await import('./route')
    expect((await POST(post({ data: '2026-10-22', nf: '2437979', acao: 'nao_esteve' }))).status).toBe(200)
    expect((await POST(post({ data: '2026-10-22', nf: '2437979', acao: 'ponto_errado', observacao: 'cliente mudou de endereço' }))).status).toBe(200)
    expect(registrar.mock.calls.map(c => (c[0] as { resolucao: string }).resolucao)).toEqual(['nao_esteve_no_local', 'desatualizado'])
    expect(guardar).not.toHaveBeenCalled()
  })

  it('Rio Quality grava com a chave da RQ', async () => {
    const { POST } = await import('./route')
    await POST(post({ data: '2026-10-22', nf: '5558931', acao: 'nao_esteve' }, 'rioquality'))
    expect(registrar.mock.calls[0][0]).toMatchObject({ empresa: 'RIO QUALITY' })
    expect(nfDoDia).toHaveBeenCalledWith('rioquality', '2026-10-22', '2026-10-24', '5558931')
  })

  it('só operador e admin gravam: sem permissão, nada é lido nem gravado', async () => {
    acesso.mockResolvedValue({ ok: false, resp: new NextResponse('Sem permissão.', { status: 403 }) })
    const { POST } = await import('./route')
    const res = await POST(post({ data: '2026-10-22', nf: '2437979', acao: 'comprovante', comprovante: foto() }))
    expect(res.status).toBe(403)
    expect(registrar).not.toHaveBeenCalled()
    expect(guardar).not.toHaveBeenCalled()
  })

  it('NF que não está no dia: 404; dia sem KPI: 409; ação, data ou anexo inválidos: 400', async () => {
    const { POST } = await import('./route')
    nfDoDia.mockResolvedValueOnce(null)
    expect((await POST(post({ data: '2026-10-22', nf: '999', acao: 'nao_esteve' }))).status).toBe(404)
    nfDoDia.mockResolvedValueOnce('sem_dia')
    expect((await POST(post({ data: '2026-10-19', nf: '1', acao: 'nao_esteve' }))).status).toBe(409)
    expect((await POST(post({ data: '2026-10-22', nf: '1', acao: 'apagar' }))).status).toBe(400)
    expect((await POST(post({ data: '2026-10-25', nf: '1', acao: 'nao_esteve' }))).status).toBe(400)
    const html = new File(['<b>'], 'x.html', { type: 'text/html' })
    expect((await POST(post({ data: '2026-10-22', nf: '1', acao: 'comprovante', comprovante: html }))).status).toBe(400)
    expect(registrar).not.toHaveBeenCalled()
  })

  it('falha ao gravar a resolução apaga o anexo que subiu', async () => {
    registrar.mockRejectedValueOnce(new Error('banco fora'))
    const { POST } = await import('./route')
    const res = await POST(post({ data: '2026-10-22', nf: '2437979', acao: 'comprovante', comprovante: foto() }))
    expect(res.status).toBe(500)
    expect(apagar).toHaveBeenCalledWith(guardar.mock.calls[0][0])
  })
})

describe('GET /api/kpi/resolucao', () => {
  it('devolve só a vigente de cada NF, sem o caminho do arquivo', async () => {
    buscar.mockResolvedValue([
      { id: 1, empresa: 'NUTRY MAX', data: '2026-10-22', nf: '2437979', resolucao: 'nao_esteve_no_local', placa_executora: null, observacao: null, responsavel: 'a', documento: null, criado_em: '2026-10-23T10:00:00Z' },
      { id: 2, empresa: 'NUTRY MAX', data: '2026-10-22', nf: '2437979', resolucao: 'entregue', placa_executora: null, observacao: null, responsavel: 'b', documento: 'comprovantes/x.jpg', criado_em: '2026-10-23T11:00:00Z' },
    ])
    const { GET } = await import('./route')
    const res = await GET(new NextRequest('http://x/api/kpi/resolucao?cliente=nutrimax&data=2026-10-22'))
    expect(buscar).toHaveBeenCalledWith('NUTRY MAX', '2026-10-22')
    const j = await res.json()
    expect(j).toEqual({ resolucoes: [{ id: 2, nf: '2437979', resolucao: 'entregue', responsavel: 'b', criadoEm: '2026-10-23T11:00:00Z', observacao: null, placaExecutora: null, temComprovante: true }], historico: 2 })
  })
  it('tabela indisponível: 503 (a tela segue sem a fila gravada)', async () => {
    buscar.mockRejectedValue(new Error('relation does not exist'))
    const { GET } = await import('./route')
    expect((await GET(new NextRequest('http://x/api/kpi/resolucao?cliente=nutrimax&data=2026-10-22'))).status).toBe(503)
  })
})
