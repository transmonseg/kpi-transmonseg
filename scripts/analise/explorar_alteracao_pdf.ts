/**
 * Explora o PDF de alteração do dia 22 usando pdfjs-serverless,
 * imprime itens com coordenadas pra entender a estrutura tabular.
 */
import { readFileSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { getDocument } from 'pdfjs-serverless'

const PDF_PATH = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 22/alteracoes/ALTERACAO DE ESCALA GERAL 22.05.pdf'

interface Item { x: number; y: number; w: number; h: number; str: string }

async function main() {
  const buf = readFileSync(PDF_PATH)
  const pdf = await getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise
  process.stdout.write(`Páginas: ${pdf.numPages}\n\n`)

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 1 })
    const content = await page.getTextContent()
    process.stdout.write(`=== Página ${i} (W=${viewport.width.toFixed(0)} H=${viewport.height.toFixed(0)}) ===\n`)

    const items: Item[] = []
    for (const it of content.items) {
      if (!('str' in it)) continue
      const txt = (it as { str: string }).str
      if (!txt.trim()) continue
      const tr = (it as { transform: number[] }).transform
      const w = (it as { width?: number }).width ?? 0
      const h = (it as { height?: number }).height ?? 0
      items.push({ x: tr[4], y: tr[5], w, h, str: txt })
    }

    // Agrupa por linha (mesmo Y dentro de tolerância)
    const tol = 3
    items.sort((a, b) => b.y - a.y || a.x - b.x) // Y desc, X asc
    const linhas: Item[][] = []
    let atual: Item[] = []
    let lastY: number | null = null
    for (const it of items) {
      if (lastY === null || Math.abs(it.y - lastY) <= tol) {
        atual.push(it)
        if (lastY === null) lastY = it.y
      } else {
        if (atual.length > 0) linhas.push([...atual])
        atual = [it]
        lastY = it.y
      }
    }
    if (atual.length > 0) linhas.push(atual)

    for (const lin of linhas) {
      lin.sort((a, b) => a.x - b.x)
      const cells = lin.map(it => `[x=${it.x.toFixed(0)}|"${it.str}"]`).join(' ')
      process.stdout.write(`  y=${lin[0].y.toFixed(0)}: ${cells}\n`)
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
