import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { gerarPdfResumoDia, textoSeguroPdf } from './resumo-dia-pdf'
import { montarResumoDia } from './resumo-dia'
import { nfsDe2210 } from './ao-vivo.fixture-2026-10-22'
import { resumirPlacas, contarCorretas } from './ao-vivo'

describe('Baixar PDF do Resumo do dia (F3-02)', () => {
  it('gera um PDF válido de 22/10 com o título do dia', async () => {
    const { nfs, cargas } = nfsDe2210()
    const placas = resumirPlacas('2026-10-22', nfs, cargas, new Map())
    const resumo = montarResumoDia({
      cliente: 'nutrimax', data: '2026-10-22', meta: 97, anteriores: [],
      resultado: { calculadoEm: '2026-10-23T03:30:24.421Z', resumo: { taxa: 96.9, entregues: 2183, nfsNaConta: 2253, aguardando: 0, totalNfs: 2272, feitas: contarCorretas(placas), pct: 96 }, placas },
    })
    const bytes = await gerarPdfResumoDia(resumo, 'Nutry Max')
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-')
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1)
    expect(doc.getTitle()).toBe('Resumo do dia - Nutry Max - 2026-10-22')
  })
  it('troca o que a fonte padrão não tem', () => {
    expect(textoSeguroPdf('96,9% · meta 97% — faltam 3 ≥')).toBe('96,9% · meta 97% - faltam 3 >=')
  })
})
