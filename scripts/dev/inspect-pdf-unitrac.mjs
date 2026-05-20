// Inspeciona estrutura de um PDF Unitrac.
// Uso: node scripts/inspect-pdf-unitrac.mjs <pdf>

import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
const require = createRequire(import.meta.url)
const pdfParse = require('pdf-parse')

const input = process.argv[2]
if (!input) { console.error('Uso: inspect-pdf-unitrac.mjs <pdf>'); process.exit(1) }

const buf = await readFile(input)
const data = await pdfParse(buf)

console.log(`=== ${input} ===`)
console.log(`Páginas: ${data.numpages}`)
console.log(`Total caracteres: ${data.text.length}`)
console.log('\n=== Primeiros 5000 chars ===')
console.log(data.text.slice(0, 5000))
console.log('\n=== Caracteres 5000-7000 ===')
console.log(data.text.slice(5000, 7000))
