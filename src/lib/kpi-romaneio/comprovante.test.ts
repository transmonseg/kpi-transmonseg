import { describe, it, expect } from 'vitest'
import { validarComprovante, caminhoComprovante, COMPROVANTE_MAX_BYTES } from './comprovante'

describe('comprovante da conferência (F3-03, D-07)', () => {
  it('foto e PDF passam; outro tipo, vazio ou grande demais não', () => {
    expect(validarComprovante({ type: 'image/jpeg', size: 2_500_000 })).toEqual({ ok: true, extensao: 'jpg' })
    expect(validarComprovante({ type: 'application/pdf', size: 90_000 })).toEqual({ ok: true, extensao: 'pdf' })
    expect(validarComprovante({ type: 'text/html', size: 10 })).toMatchObject({ ok: false })
    expect(validarComprovante({ type: 'image/png', size: 0 })).toMatchObject({ ok: false })
    expect(validarComprovante({ type: 'image/png', size: COMPROVANTE_MAX_BYTES + 1 })).toMatchObject({ ok: false })
  })
  it('caminho no bucket do KPI por cliente e dia, sem caractere estranho da NF', () => {
    expect(caminhoComprovante('nutrimax', '2026-10-22', '2437979', 'jpg', 1761224700000, 'a1b2')).toBe('comprovantes/nutrimax/2026-10-22/2437979-1761224700000-a1b2.jpg')
    expect(caminhoComprovante('rioquality', '2026-10-22', '../x/1', 'pdf', 1, 'z')).toBe('comprovantes/rioquality/2026-10-22/___x_1-1-z.pdf')
  })
})
