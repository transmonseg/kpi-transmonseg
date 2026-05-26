/**
 * Imprime os items do PDF com suas coordenadas X/Y pra descobrir o layout real.
 */
import { readFileSync } from 'fs'
import { getDocument } from 'pdfjs-serverless'

;(async () => {
  const buf = readFileSync('C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 19/relatorio_9572.pdf')
  const pdf = await getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise
  // Pega a página 128 que tinha LQU-5546
  const page = await pdf.getPage(128)
  const content = await page.getTextContent()

  // Filtra só os primeiros 100 items (cabeçalho + algumas paradas)
  const items = content.items.filter(i => 'str' in i).slice(0, 100) as any[]
  console.log('Items da página 128 (primeiros 100):')
  for (const it of items) {
    if (!it.str.trim()) continue
    const x = it.transform[4]
    const y = it.transform[5]
    console.log(`  x=${x.toFixed(1).padStart(7)} y=${y.toFixed(1).padStart(7)}  "${it.str}"`)
  }
})()
