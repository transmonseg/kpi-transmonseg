import { describe, it, expect } from 'vitest'
import { lerRespostaOfertas } from './ofertas-resposta'

// F3-R08: GET /api/dashboard-kpi/fechamento com erro virava "nenhuma oferta"
// calada: o cartão "Fechamento disponível" sumia sem aviso.
describe('lerRespostaOfertas (cartão "Fechamento disponível")', () => {
  const resp = (status: number, corpo: unknown) => ({ ok: status < 400, status, json: async () => corpo })
  it('500 da rota: mostra aviso em vez de sumir calado', async () => {
    const r = await lerRespostaOfertas(resp(500, null))
    expect(r.ofertas).toEqual([])
    expect(r.erro).toMatch(/Não consegui conferir se há fechamento disponível/)
  })
  it('403 (quem não insere KPI): nada a mostrar, sem aviso', async () => {
    expect(await lerRespostaOfertas(resp(403, null))).toEqual({ ofertas: [], erro: null })
  })
  it('ok: devolve as ofertas', async () => {
    const r = await lerRespostaOfertas(resp(200, { ofertas: [{ data: '2026-10-22' }] }))
    expect(r).toEqual({ ofertas: [{ data: '2026-10-22' }], erro: null })
  })
})
