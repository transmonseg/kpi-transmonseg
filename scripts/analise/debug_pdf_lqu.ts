/**
 * Debug do parser PDF para LQU5546 no dia 19.
 * Mostra o texto raw da seção dessa placa antes e depois do preprocess
 * para identificar onde o parser comete o erro.
 */
import { readFileSync } from 'fs'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>

;(async () => {
  const buf = readFileSync('C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 19/relatorio_9572.pdf')
  const result = await pdfParse(buf)
  const text = result.text

  // Procurar seção da LQU-5546
  const idx = text.indexOf('LQU-5546')
  if (idx < 0) { console.log('Não achei LQU-5546'); return }

  // Pegar 3000 chars dessa seção
  const start = Math.max(0, idx - 100)
  const section = text.slice(start, idx + 5000)
  console.log('═══ RAW TEXT da seção LQU-5546 ═══')
  console.log(section)
})().catch(e => { console.error(e); process.exit(1) })
