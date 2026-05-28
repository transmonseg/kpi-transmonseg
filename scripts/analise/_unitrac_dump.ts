/**
 * Dump TEXTO BRUTO completo do relatório Unitrac dia 19 — pra leitura humana linha a linha.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFileSync } from 'fs'
import { getDocument } from 'pdfjs-serverless'

const PDF = 'docs/conversas-tia-erica/dia-19/unitrac/relatorio_9572.pdf'

async function main() {
  const buf = readFileSync(PDF)
  const pdf = await getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise
  console.log(`# Unitrac dia 19 — ${pdf.numPages} páginas\n`)
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const linhas: string[] = []
    let linhaAtual: string[] = []
    let lastY: number | null = null
    for (const item of content.items) {
      if (!('str' in item)) continue
      const txt = (item as { str: string }).str
      const y = (item as { transform?: number[] }).transform?.[5] ?? 0
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        if (linhaAtual.length) linhas.push(linhaAtual.join(' '))
        linhaAtual = []
      }
      linhaAtual.push(txt)
      lastY = y
    }
    if (linhaAtual.length) linhas.push(linhaAtual.join(' '))
    console.log(`\n========== PÁGINA ${i} ==========`)
    for (const l of linhas) {
      const clean = l.replace(/\s+/g, ' ').trim()
      if (clean) console.log(clean)
    }
  }
}
main().catch(e => { console.error(e); process.exit(1) })
