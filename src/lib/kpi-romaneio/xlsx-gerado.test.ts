import { describe, it, expect, vi } from 'vitest'
import { guardarXlsxGerado, caminhoXlsxGerado, novoPrefixoGeracao, BUCKET_KPI_ROMANEIO, TIPO_XLSX } from './xlsx-gerado'

function svcCom(upload: (...a: unknown[]) => Promise<{ error: { message: string } | null }>) {
  const from = vi.fn(() => ({ upload }))
  return { svc: { storage: { from } } as never, from }
}

describe('guardarXlsxGerado', () => {
  it('sobe <prefixo>-kpi.xlsx no bucket dos inputs com content-type xlsx e devolve o caminho', async () => {
    const upload = vi.fn(async () => ({ error: null }))
    const { svc, from } = svcCom(upload)
    const buf = Buffer.from('x')
    const r = await guardarXlsxGerado(svc, 'nutrimax/2026-10-01/abc', buf)
    expect(r).toBe('nutrimax/2026-10-01/abc-kpi.xlsx')
    expect(from).toHaveBeenCalledWith(BUCKET_KPI_ROMANEIO)
    expect(upload).toHaveBeenCalledWith('nutrimax/2026-10-01/abc-kpi.xlsx', buf, { contentType: TIPO_XLSX })
  })

  it('erro do storage -> null + log, nao lanca', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { svc } = svcCom(async () => ({ error: { message: 'boom' } }))
    expect(await guardarXlsxGerado(svc, 'p', Buffer.from('x'))).toBeNull()
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })

  it('excecao do storage -> null + log, nao lanca', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { svc } = svcCom(async () => { throw new Error('rede') })
    expect(await guardarXlsxGerado(svc, 'p', Buffer.from('x'))).toBeNull()
    err.mockRestore()
  })
})

describe('caminhos', () => {
  it('prefixo novo segue <cliente>/<data>/<uuid>', () => {
    expect(novoPrefixoGeracao('rioquality', '2026-10-01')).toMatch(/^rioquality\/2026-10-01\/[0-9a-f-]{36}$/)
    expect(caminhoXlsxGerado('a/b/c')).toBe('a/b/c-kpi.xlsx')
  })
})
