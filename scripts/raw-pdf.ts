import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const req = createRequire(import.meta.url)
async function main() {
  const pdfParse = req('pdf-parse')
  const data = await pdfParse(readFileSync('C:/Users/media/Downloads/relatorio_10122.pdf'))
  const txt: string = data.text
  const linhas = txt.split('\n')
  for (const alvo of ['LCO', 'KNI8942', 'KNI 8942']) {
    console.log(`\n════ contexto de "${alvo}" ════`)
    for (let i = 0; i < linhas.length; i++) {
      if (linhas[i].toUpperCase().includes(alvo.toUpperCase())) {
        for (let j = i; j < Math.min(i + 14, linhas.length); j++) {
          const l = linhas[j].trim()
          if (l) console.log('   ' + l.slice(0, 100))
        }
        console.log('   ---')
      }
    }
  }
}
main().catch(e => { console.error(e.message); process.exit(1) })
