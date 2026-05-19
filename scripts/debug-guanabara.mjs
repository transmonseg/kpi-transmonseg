import fs from 'node:fs'
const PDF = 'C:/Users/media/Downloads/escala 15.005 (5).pdf'
const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default

const buf = fs.readFileSync(PDF)
const result = await pdfParse(buf)
const text = result.text ?? ''

console.log(`\n=== Tamanho do texto: ${text.length} chars ===\n`)
console.log('=== Primeiros 2500 chars ===')
console.log(text.slice(0, 2500))
console.log('\n=== Procura por HLOG / ESCALA GUANABARA ===')
const lines = text.split(/\r?\n/)
for (let i = 0; i < Math.min(lines.length, 50); i++) {
  if (lines[i].trim()) console.log(`L${i}: ${lines[i]}`)
}
