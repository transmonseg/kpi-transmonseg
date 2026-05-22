import { getDocument } from 'pdfjs-serverless'
import type { ResumoVeiculo } from '@/lib/types/unitrac'
import { parseTextToResumos } from './unitrac-pdf'

/**
 * Alternative PDF text extractor using pdfjs-serverless.
 * Extracts text page by page, joins with newlines, then reuses
 * the same parseTextToResumos() pipeline as the pdf-parse version.
 *
 * Activated via PDF_PARSER_BACKEND=pdfjs-serverless env var.
 * Run in shadow mode via PDF_SHADOW_MODE=true (logs diffs, no output change).
 */
export async function parseUnitracPdfJs(
  buffer: Buffer,
  cadastroPlacas?: ReadonlySet<string> | null,
): Promise<ResumoVeiculo[]> {
  if (buffer.length === 0) return []

  try {
    const pdf = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise
    const pages: string[] = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      const pageText = content.items
        .filter((item) => 'str' in item)
        .map(item => (item as { str: string }).str)
        .join(' ')
      pages.push(pageText)
    }
    const fullText = pages.join('\n')
    return parseTextToResumos(fullText, cadastroPlacas)
  } catch (err) {
    console.error('[pdfjs-serverless] extraction error:', err)
    return []
  }
}
