import { describe, it, expect } from 'vitest'
import { parseUnitracPdfJs } from './unitrac-pdf-pdfjs'

describe('parseUnitracPdfJs', () => {
  it('retorna [] para buffer vazio', async () => {
    expect(await parseUnitracPdfJs(Buffer.from(''))).toEqual([])
  })

  it('retorna [] para buffer invalido', async () => {
    expect(await parseUnitracPdfJs(Buffer.from('not-a-pdf'))).toEqual([])
  })
})
