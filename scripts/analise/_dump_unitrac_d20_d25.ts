import { config } from 'dotenv'
config({ path: '.env.local' })
import { getDocument } from 'pdfjs-serverless'
import { readFileSync, writeFileSync } from 'fs'

async function dump(pdfPath: string, outPath: string) {
  const buf = readFileSync(pdfPath)
  const pdf = await getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise
  const out: string[] = [`# ${pdfPath} — ${pdf.numPages} páginas`]
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
    out.push(`\n========== PÁGINA ${i} ==========`)
    for (const l of linhas) {
      const clean = l.replace(/\s+/g, ' ').trim()
      if (clean) out.push(clean)
    }
  }
  writeFileSync(outPath, out.join('\n'))
  console.log(`OK ${outPath}`)
}
async function main() {
  await dump('docs/conversas-tia-erica/dia-20/unitrac/relatorio_9522.pdf', 'scripts/analise/_unitrac_d20.txt')
  await dump('docs/conversas-tia-erica/dia-25/unitrac/relatorio_9652.pdf', 'scripts/analise/_unitrac_d25.txt')
}
main().catch(e => { console.error(e); process.exit(1) })
