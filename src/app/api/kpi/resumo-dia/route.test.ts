import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

vi.mock('../ao-vivo/acesso', () => ({
  acessoAoVivo: vi.fn(async (cliente: string | null) => ({ ok: true, cliente, email: 't@t', clientes: ['nutrimax', 'rioquality'] })),
}))
vi.mock('@/lib/data-br', () => ({ hojeBR: () => '2026-10-24' }))
const carregar = vi.fn()
vi.mock('@/lib/kpi-romaneio/resumo-dia-servico', () => ({ carregarResumoDia: (...a: unknown[]) => carregar(...a) }))

import { montarResumoDia } from '@/lib/kpi-romaneio/resumo-dia'
const resumo = montarResumoDia({
  cliente: 'nutrimax', data: '2026-10-22', meta: 97, anteriores: [],
  resultado: { calculadoEm: '2026-10-23T03:30:24.421Z', resumo: { taxa: 96.9, entregues: 2183, nfsNaConta: 2253, aguardando: 0, totalNfs: 2272, feitas: 2183, pct: 96 }, placas: [] },
})

describe('GET /api/kpi/resumo-dia (F3-02)', () => {
  beforeEach(() => carregar.mockReset())

  it('devolve o resumo do dia pedido', async () => {
    carregar.mockResolvedValue({ resumo, texto: 'Resumo do dia — Nutry Max — 22/10/2026', nomeCliente: 'Nutry Max', avisos: [] })
    const { GET } = await import('./route')
    const res = await GET(new Request('http://x/api/kpi/resumo-dia?cliente=nutrimax&data=2026-10-22'))
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.resumo.resultado).toMatchObject({ faltam: 3, meta: 97 })
    expect(carregar).toHaveBeenCalledWith('nutrimax', '2026-10-22')
  })

  it('sem data usa hoje; data futura ou torta é 400', async () => {
    carregar.mockResolvedValue({ resumo, texto: '', nomeCliente: 'Nutry Max', avisos: [] })
    const { GET } = await import('./route')
    await GET(new Request('http://x/api/kpi/resumo-dia?cliente=nutrimax'))
    expect(carregar).toHaveBeenCalledWith('nutrimax', '2026-10-24')
    expect((await GET(new Request('http://x/api/kpi/resumo-dia?cliente=nutrimax&data=2026-10-25'))).status).toBe(400)
    expect((await GET(new Request('http://x/api/kpi/resumo-dia?cliente=nutrimax&data=22/10'))).status).toBe(400)
  })

  it('dia sem nada guardado é 404', async () => {
    carregar.mockResolvedValue(null)
    const { GET } = await import('./route')
    expect((await GET(new Request('http://x/api/kpi/resumo-dia?cliente=nutrimax&data=2026-10-19'))).status).toBe(404)
  })

  it('formato=pdf baixa o arquivo', async () => {
    carregar.mockResolvedValue({ resumo, texto: '', nomeCliente: 'Nutry Max', avisos: [] })
    const { GET } = await import('./route')
    const res = await GET(new Request('http://x/api/kpi/resumo-dia?cliente=nutrimax&data=2026-10-22&formato=pdf'))
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('content-disposition')).toContain('resumo-nutrimax-2026-10-22.pdf')
    expect(Buffer.from(await res.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-')
  })
})

describe('Resumo do dia não tem ação de envio (regra 6 do dono)', () => {
  const ler = (rel: string) => readFileSync(path.resolve(__dirname, rel), 'utf8')
  const rota = ler('./route.ts')
  const pagina = ler('../../../painel/resumo-dia/page.tsx') + ler('../../../painel/resumo-dia/resumo-dia-tela.tsx')
  it('a rota só tem GET', () => {
    expect(rota).toMatch(/export async function GET/)
    expect(rota).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/)
  })
  it('a página só copia e baixa: nenhum botão de enviar, WhatsApp ou e-mail, nenhum POST', () => {
    expect(pagina).toContain('Copiar texto')
    expect(pagina).toContain('Baixar PDF')
    expect(pagina).not.toMatch(/whatsapp|e-?mail|mailto:|method:\s*'POST'|>\s*Enviar|Enviar ao|Mandar/i)
  })
})
