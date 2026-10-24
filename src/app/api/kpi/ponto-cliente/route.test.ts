import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { PainelCompleto } from '@/lib/kpi-romaneio/ponto-cliente-servico'

// F4-07 (GEO-24, ACH-07, D-08): "Corrigir ponto". Só operador com a Nutry e
// admin gravam; toda ação precisa de evidência recalculada no servidor;
// arrastar o pino só admin e só com anexo; desfazer volta ao estado anterior;
// sem a migration da trilha nada é gravado (503).
const acesso = vi.fn()
vi.mock('../ao-vivo/acesso', () => ({ acessoAoVivo: (c: string | null) => acesso(c) }))
vi.mock('@/lib/data-br', () => ({ hojeBR: () => '2026-10-24' }))
const montarPainel = vi.fn()
const listar = vi.fn()
const documento = vi.fn()
const repo = { tag: 'repo' }
vi.mock('@/lib/kpi-romaneio/ponto-cliente-servico', () => ({
  montarPainel: (...a: unknown[]) => montarPainel(...a),
  listarClientesQueFalham: (...a: unknown[]) => listar(...a),
  documentoDaCorrecao: (...a: unknown[]) => documento(...a),
  repoSupabase: () => repo,
  esquecerJanela: () => {},
}))
const aplicar = vi.fn()
const desfazer = vi.fn()
vi.mock('@/lib/kpi-romaneio/ponto-cliente-correcao', async (orig) => ({
  ...(await orig<typeof import('@/lib/kpi-romaneio/ponto-cliente-correcao')>()),
  aplicarCorrecaoPonto: (...a: unknown[]) => aplicar(...a),
  desfazerCorrecaoPonto: (...a: unknown[]) => desfazer(...a),
}))
const guardar = vi.fn()
const apagar = vi.fn()
vi.mock('@/lib/kpi-romaneio/conferencia-servico', () => ({
  guardarComprovante: (...a: unknown[]) => guardar(...a),
  apagarComprovante: (...a: unknown[]) => apagar(...a),
  baixarComprovante: async () => Buffer.from('x'),
}))

const ERICA = { ok: true, cliente: 'nutrimax', email: 'erica@transmonseg.com.br', clientes: ['nutrimax'], admin: false }
const ADMIN = { ...ERICA, email: 'dono@transmonseg.com.br', admin: true }
const PAINEL = {
  codigo: '163983', nome: 'CHURRASCARIA JACARE', endereco: 'RODOVIA PRESIDENTE JOAO GOULART, S/N - APERIBÉ, APERIBE - ANEXO - 28495521',
  pontoAtual: null, local: null, paradas: [], cadastros: [], nfs: [], correcoes: [], correcaoLiberada: true, ruaConferida: true,
} as unknown as PainelCompleto

function post(campos: Record<string, string | File>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.append(k, v)
  return new NextRequest('http://x/api/kpi/ponto-cliente?cliente=nutrimax', { method: 'POST', body: fd })
}
const foto = () => new File([new Uint8Array(2048)], 'print.png', { type: 'image/png' })

beforeEach(() => {
  for (const f of [acesso, montarPainel, listar, documento, aplicar, desfazer, guardar, apagar]) f.mockReset()
  acesso.mockResolvedValue(ERICA)
  montarPainel.mockResolvedValue(PAINEL)
  guardar.mockResolvedValue(undefined)
  aplicar.mockResolvedValue({ ok: true, correcao: { id: 7, acao: 'parada', lat: -21.638098, lng: -42.099263, documento: null, anterior: null, evidencia: {} } })
  desfazer.mockResolvedValue({ ok: true })
})

describe('GET /api/kpi/ponto-cliente', () => {
  it('lista os clientes que falham (só Nutry)', async () => {
    listar.mockResolvedValue({ dias: ['2026-10-23'], clientes: [{ codigo: '6044' }] })
    const { GET } = await import('./route')
    const res = await GET(new NextRequest('http://x/api/kpi/ponto-cliente?cliente=nutrimax'))
    expect(res.status).toBe(200)
    expect((await res.json()).clientes).toEqual([{ codigo: '6044' }])
  })
  it('Rio Quality: 422 (o código do cliente é a NF até o F4-09)', async () => {
    acesso.mockResolvedValue({ ...ERICA, cliente: 'rioquality' })
    const { GET } = await import('./route')
    expect((await GET(new NextRequest('http://x/api/kpi/ponto-cliente?cliente=rioquality'))).status).toBe(422)
    expect(listar).not.toHaveBeenCalled()
  })
  it('painel de um cliente', async () => {
    const { GET } = await import('./route')
    const res = await GET(new NextRequest('http://x/api/kpi/ponto-cliente?cliente=nutrimax&codigo=163983'))
    expect(res.status).toBe(200)
    expect(montarPainel).toHaveBeenCalledWith('2026-10-24', '163983', expect.anything())
    expect((await res.json()).painel.codigo).toBe('163983')
  })
})

describe('POST /api/kpi/ponto-cliente', () => {
  it('sem permissão (visualizador/gerente): 403 sem ler nem gravar', async () => {
    acesso.mockResolvedValue({ ok: false, resp: new Response('Sem permissão.', { status: 403 }) })
    const { POST } = await import('./route')
    const res = await POST(post({ codigo: '163983', acao: 'parada', id: 'parada:-21.63810,-42.09926' }))
    expect(res.status).toBe(403)
    expect(montarPainel).not.toHaveBeenCalled()
    expect(aplicar).not.toHaveBeenCalled()
  })
  it('operador grava pela evidência escolhida, com o e-mail como responsável', async () => {
    const { POST } = await import('./route')
    const res = await POST(post({ codigo: '163983', acao: 'parada', id: 'parada:-21.63810,-42.09926', observacao: 'parada toda semana' }))
    expect(res.status).toBe(200)
    expect(montarPainel).toHaveBeenCalledWith('2026-10-24', '163983', { forcar: true })
    expect(aplicar).toHaveBeenCalledWith(repo, PAINEL, { acao: 'parada', id: 'parada:-21.63810,-42.09926', lat: null, lng: null, observacao: 'parada toda semana' },
      { email: 'erica@transmonseg.com.br', admin: false, documento: null })
  })
  it('sem evidência válida: a recusa da decisão volta com o status dela e o anexo é apagado', async () => {
    aplicar.mockResolvedValue({ ok: false, status: 400, erro: 'Anexe a evidência' })
    acesso.mockResolvedValue(ADMIN)
    const { POST } = await import('./route')
    const res = await POST(post({ codigo: '163983', acao: 'pino', lat: '-21.6381', lng: '-42.0993', observacao: 'print', evidencia: foto() }))
    expect(res.status).toBe(400)
    expect(guardar).toHaveBeenCalledTimes(1)
    expect(apagar).toHaveBeenCalledWith(guardar.mock.calls[0][0])
  })
  it('pino: operador não pode (403) e nada é guardado', async () => {
    const { POST } = await import('./route')
    const res = await POST(post({ codigo: '163983', acao: 'pino', lat: '-21.6381', lng: '-42.0993', observacao: 'x', evidencia: foto() }))
    expect(res.status).toBe(403)
    expect(guardar).not.toHaveBeenCalled()
    expect(aplicar).not.toHaveBeenCalled()
  })
  it('pino sem anexo: 400 antes de gravar', async () => {
    acesso.mockResolvedValue(ADMIN)
    const { POST } = await import('./route')
    const res = await POST(post({ codigo: '163983', acao: 'pino', lat: '-21.6381', lng: '-42.0993', observacao: 'x' }))
    expect(res.status).toBe(400)
    expect(aplicar).not.toHaveBeenCalled()
  })
  it('admin com anexo: guarda no bucket da fila Conferir e passa o caminho', async () => {
    acesso.mockResolvedValue(ADMIN)
    const { POST } = await import('./route')
    const res = await POST(post({ codigo: '163983', acao: 'pino', lat: '-21.6381', lng: '-42.0993', observacao: 'print do cadastro', evidencia: foto() }))
    expect(res.status).toBe(200)
    const caminho = guardar.mock.calls[0][0] as string
    expect(caminho).toMatch(/^comprovantes\/nutrimax\/ponto-cliente\/163983-\d+-[a-f0-9]+\.png$/)
    expect(aplicar.mock.calls[0][3]).toEqual({ email: 'dono@transmonseg.com.br', admin: true, documento: caminho })
    expect(aplicar.mock.calls[0][2]).toMatchObject({ acao: 'pino', lat: -21.6381, lng: -42.0993 })
  })
  it('sem a migration da trilha: 503 e o anexo não fica', async () => {
    const { TrilhaIndisponivel } = await import('@/lib/kpi-romaneio/ponto-cliente-correcao')
    aplicar.mockRejectedValue(new TrilhaIndisponivel())
    acesso.mockResolvedValue(ADMIN)
    const { POST } = await import('./route')
    const res = await POST(post({ codigo: '163983', acao: 'pino', lat: '-21.6381', lng: '-42.0993', observacao: 'x', evidencia: foto() }))
    expect(res.status).toBe(503)
    expect(apagar).toHaveBeenCalled()
  })
  it('ação desconhecida: 400', async () => {
    const { POST } = await import('./route')
    expect((await POST(post({ codigo: '163983', acao: 'livre', lat: '-21', lng: '-42' }))).status).toBe(400)
    expect(aplicar).not.toHaveBeenCalled()
  })
  it('desfazer: chama o desfazer com o id e o responsável', async () => {
    const { POST } = await import('./route')
    const res = await POST(post({ codigo: '163983', acao: 'desfazer', correcao: '7' }))
    expect(res.status).toBe(200)
    expect(desfazer).toHaveBeenCalledWith(repo, '163983', 7, { email: 'erica@transmonseg.com.br', admin: false })
  })
  it('desfazer recusado (ponto mudou depois): 409', async () => {
    desfazer.mockResolvedValue({ ok: false, status: 409, erro: 'O ponto mudou' })
    const { POST } = await import('./route')
    expect((await POST(post({ codigo: '163983', acao: 'desfazer', correcao: '7' }))).status).toBe(409)
  })
})
