import { readFileSync } from 'fs'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>

;(async () => {
  const buf = readFileSync('C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 21/relatorio_9553.pdf')
  const r = await pdfParse(buf)
  const idx = r.text.indexOf('UFW-0H63')
  const next = r.text.indexOf('Veículo', idx + 200)
  console.log(r.text.slice(idx, next))
})()
