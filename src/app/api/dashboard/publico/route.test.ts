import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

// SEG-03 (auditoria 03/11): o link público devolvia placas e nomes de
// motoristas de qualquer período (01/05 a 03/11, 318 KB, sem login).
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({}) }))
vi.mock('@/lib/kpi/dashboard-query', async orig => ({
  ...(await orig<typeof import('@/lib/kpi/dashboard-query')>()),
  carregarEntradasManuais: vi.fn(async () => []),
}))
vi.mock('@/lib/kpi/dashboard-metricas', () => ({
  filtrar: (l: unknown[]) => l,
  calcularMetricas: () => ({ total: 1, placasMaisAtivas: [{ placa: 'RQU5H30', entregas: 3 }], topMotoristas: [{ motorista: 'JOAO', entregas: 3 }], topNaoFoi: [] }),
}))

import { GET } from './route'
const pedir = (q: string) => GET(new NextRequest(`http://x/api/dashboard/publico?${q}`))

describe('dashboard público (SEG-03)', () => {
  it('período maior que 31 dias: 400', async () => {
    expect((await pedir('periodo=custom&de=2026-01-01&ate=2026-11-03&completo=1')).status).toBe(400)
    expect((await pedir('periodo=ano&data=2026-11-03')).status).toBe(400)
  })
  it('até 31 dias responde, sem placa nem motorista (também no período anterior)', async () => {
    const r = await pedir('periodo=mes&data=2026-10-15')
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.metricas).not.toHaveProperty('placasMaisAtivas')
    expect(j.metricas).not.toHaveProperty('topMotoristas')
    expect(j.metricas.total).toBe(1)
    const c = await (await pedir('periodo=custom&de=2026-10-01&ate=2026-10-31')).json()
    expect(c.metricas).not.toHaveProperty('topMotoristas')
  })
  it('data inválida: 400', async () => {
    expect((await pedir('periodo=custom&de=x&ate=2026-10-31')).status).toBe(400)
  })
})
