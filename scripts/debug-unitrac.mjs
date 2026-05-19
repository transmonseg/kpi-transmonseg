// Debug: extrai texto cru do PDF Unitrac e tenta achar headers de veículos
import fs from 'node:fs'

const PDF = 'C:/Users/media/Downloads/relatorio_9206.pdf'

// Import direto da implementação pra evitar o debug block do index.js
const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default

const buf = fs.readFileSync(PDF)
const result = await pdfParse(buf)
const text = result.text ?? ''

console.log(`\n=== Tamanho do texto extraído: ${text.length} chars ===\n`)

console.log('=== Primeiros 1500 chars ===')
console.log(text.slice(0, 1500))
console.log('\n... [truncado]\n')

console.log('\n=== Procura por "Veículo" / "Placa" / "Início Viagem" ===')
const linhas = text.split(/\r?\n/)
let counter = 0
for (let i = 0; i < linhas.length; i++) {
  if (/Veículo.*Início Viagem|Placa|Inicio Viagem|VEHICLE/i.test(linhas[i])) {
    console.log(`  L${i}: ${linhas[i]}`)
    counter++
    if (counter > 8) break
  }
}

console.log('\n=== Procura padrão de placa (ABC-1234 ou ABC1D23) ===')
const placaRe = /[A-Z]{3}-?\d[A-Z0-9]\d{2}/g
const matches = text.match(placaRe) ?? []
const unicas = [...new Set(matches)].slice(0, 20)
console.log(`  ${matches.length} matches, ${unicas.length} placas únicas:`)
console.log(`  ${unicas.join(', ')}`)

console.log('\n=== Procura por cabeçalho do bloco veículo ===')
// Padrão esperado: PLACA DATA HH:MM DATA HH:MM N (qtd_paradas)
const blocoRe = /([A-Z]{3}-?\d[A-Z0-9]\d{2})\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})\s+(\d+)/g
const blocos = text.match(blocoRe) ?? []
console.log(`  ${blocos.length} headers de veículo encontrados`)
if (blocos.length > 0) console.log(`  Exemplo: ${blocos[0]}`)
