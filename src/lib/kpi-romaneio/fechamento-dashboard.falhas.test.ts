import { describe, it, expect, vi, beforeEach } from 'vitest'

// F3-R08: falha do Storage no fechamento e falha ao listar ofertas não podem
// ficar caladas.

const st = vi.hoisted(() => ({ uploadErro: null as { message: string } | null, gravados: [] as Record<string, unknown>[] }))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    storage: { from: () => ({ upload: async () => ({ error: st.uploadErro }) }) },
    from: () => ({ upsert: async (linha: Record<string, unknown>) => { st.gravados.push(linha); return { error: null } } }),
  }),
}))

import { depsReaisTrocar } from './fechamento-dashboard'

beforeEach(() => { st.uploadErro = null; st.gravados = []; vi.restoreAllMocks(); vi.spyOn(console, 'error').mockImplementation(() => {}) })

const linha = { cliente: 'nutrimax' as const, data: '2026-10-22', resumo: { taxa: 96.9 } as never, nfs: [], xlsx: Buffer.from('x'), inseridoPor: 'Fechamento automático (00:30)' }

describe('gravarDashboard (F3-R08)', () => {
  it('upload da planilha falhou: grava o número sem arquivo e registra o erro', async () => {
    st.uploadErro = { message: 'storage indisponível' }
    await depsReaisTrocar.gravar(linha)
    expect(st.gravados[0]).toMatchObject({ arquivo_storage_path: null })
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('storage indisponível'))
  })
  it('upload ok: caminho gravado, sem erro', async () => {
    await depsReaisTrocar.gravar(linha)
    expect(st.gravados[0]).toMatchObject({ arquivo_storage_path: 'dashboard/nutrimax/2026-10-22-fechamento.xlsx' })
    expect(console.error).not.toHaveBeenCalled()
  })
})

