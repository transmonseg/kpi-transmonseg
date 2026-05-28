/**
 * Mapeia placa → página do PDF Unitrac dia 19 para citar referências
 * concretas nas perguntas pra Tia Erica.
 */
import { readFileSync } from 'fs'
import { getDocument } from 'pdfjs-serverless'

;(async () => {
  const buf = readFileSync('docs/conversas-tia-erica/dia-19/unitrac/relatorio_9572.pdf')
  const doc = await getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise

  const placaRE = /\b[A-Z]{3}-?\d[A-Z\d]\d{2}\b/g
  const mapa = new Map<string, number>() // placa → primeira página

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const tc = await page.getTextContent()
    const text = tc.items.map((it: any) => it.str ?? '').join(' ')
    const matches = [...text.matchAll(placaRE)].map(m => m[0].replace('-', ''))
    for (const placa of new Set(matches)) {
      if (!mapa.has(placa)) mapa.set(placa, i)
    }
  }

  // print ordenado por página
  const arr = [...mapa.entries()].sort((a, b) => a[1] - b[1])
  for (const [placa, pag] of arr) {
    console.log(`p.${String(pag).padStart(3, '0')} → ${placa}`)
  }
  console.log(`\nTotal placas: ${arr.length} / páginas: ${doc.numPages}`)
})().catch(e => { console.error(e); process.exit(1) })
