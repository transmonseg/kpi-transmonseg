import { describe, it, expect, vi, beforeEach } from 'vitest'

const est = vi.hoisted(() => ({ acesso: true, lidos: [] as string[] }))
vi.mock('../acesso', () => ({
  acessoAoVivo: async (c: string) => (est.acesso
    ? { ok: true, cliente: c, email: 'erica@x.com', clientes: [c] }
    : { ok: false, resp: new Response('Sem permissão.', { status: 403 }) }),
}))
vi.mock('@/lib/data-br', () => ({ hojeBR: () => '2026-10-23' }))
vi.mock('@/lib/kpi-romaneio/reconhecer-arquivo', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/kpi-romaneio/reconhecer-arquivo')>()),
  reconhecerArquivo: async (_b: Buffer, nome: string) => {
    est.lidos.push(nome)
    if (nome.startsWith('8012')) return { nome, tipo: 'romaneio_entrega', cliente: 'nutrimax', campo: 'romaneio', data: '2026-10-23', contagens: { notas: 2327, cargas: 76 }, resumo: 'Romaneio de Entrega da Nutry de 23/10 — 2.327 notas, 76 cargas' }
    if (nome.startsWith('Escala de rotas')) return { nome, tipo: 'escala_portofrio', cliente: 'portofrio', campo: null, data: null, contagens: { entregas: 273, rotas: 14 }, resumo: 'Escala de rotas da Porto Frio — 273 entregas, 14 rotas' }
    if (nome.startsWith('velho')) return { nome, tipo: 'romaneio_entrega', cliente: 'nutrimax', campo: 'romaneio', data: '2026-10-22', contagens: { notas: 1, cargas: 1 }, resumo: 'x' }
    return { nome, tipo: 'desconhecido', cliente: null, campo: null, data: null, contagens: {}, resumo: 'Não reconheci este arquivo' }
  },
}))

import { POST } from './route'

const req = (cliente: string, nomes: string[]) => {
  const fd = new FormData(); fd.set('cliente', cliente)
  for (const n of nomes) fd.append('arquivos', new File(['%PDF'], n))
  return new Request('http://x/api/kpi/ao-vivo/reconhecer', { method: 'POST', body: fd }) as never
}

describe('POST /api/kpi/ao-vivo/reconhecer (F3-06)', () => {
  beforeEach(() => { est.acesso = true; est.lidos = [] })

  it('lê cada arquivo e diz se entra no Ao vivo deste cliente; Porto Frio e desconhecido não entram', async () => {
    const r = await POST(req('nutrimax', ['8012.pdf', 'Escala de rotas 21-10.pdf', 'boleto.pdf']))
    expect(r.status).toBe(200)
    const j = await r.json() as { arquivos: { nome: string; serve: boolean; motivo?: string }[] }
    expect(j.arquivos.map(a => [a.nome, a.serve])).toEqual([['8012.pdf', true], ['Escala de rotas 21-10.pdf', false], ['boleto.pdf', false]])
    expect(j.arquivos[1].motivo).toBe('A Porto Frio ainda não entra no Ao vivo — este arquivo não será usado.')
    expect(j.arquivos[2].motivo).toBeUndefined()
  })

  it('documento da Nutry no Ao vivo da Rio Quality: não entra, e diz onde subir', async () => {
    const j = await (await POST(req('rioquality', ['8012.pdf']))).json() as { arquivos: { serve: boolean; motivo?: string }[] }
    expect(j.arquivos[0]).toMatchObject({ serve: false, motivo: 'É da Nutry Max — suba no Ao vivo da Nutry Max.' })
  })

  it('documento de outro dia: avisa já no reconhecimento (o envio recusa)', async () => {
    const j = await (await POST(req('nutrimax', ['velho.pdf']))).json() as { arquivos: { serve: boolean; motivo?: string }[] }
    expect(j.arquivos[0]).toMatchObject({ serve: false, motivo: 'É do dia 22/10, não de hoje (23/10).' })
  })

  it('sem permissão: 403 e nada é lido', async () => {
    est.acesso = false
    expect((await POST(req('nutrimax', ['8012.pdf']))).status).toBe(403)
    expect(est.lidos).toEqual([])
  })

  it('sem arquivo: 400', async () => {
    expect((await POST(req('nutrimax', []))).status).toBe(400)
  })
})
