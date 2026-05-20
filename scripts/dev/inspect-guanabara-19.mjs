// Por que 22 placas da Guanabara dia 19 não casam no Unitrac?

import { readFile } from 'node:fs/promises'
import { parseEscalaGuanabaraPdf } from '../../src/lib/parsers/escala-guanabara-pdf.ts'
import { parseUnitrac } from '../../src/lib/parsers/unitrac.ts'

const guanabaraBuf = await readFile('C:/Users/media/Downloads/dia 19/ESCALA 19.05.pdf')
const unitracBuf = await readFile('C:/Users/media/Downloads/dia 19/relatorio_9521.xlsx')

const linhas = await parseEscalaGuanabaraPdf(guanabaraBuf, '2026-05-19')
const veiculos = await parseUnitrac(unitracBuf.buffer.slice(unitracBuf.byteOffset, unitracBuf.byteOffset + unitracBuf.byteLength))

const placasUnitrac = new Set(veiculos.map(v => v.placa_norm))
console.log(`\nGuanabara PDF: ${linhas.length} linhas`)
console.log(`Unitrac: ${veiculos.length} veículos\n`)

console.log('Rota | Motorista          | Placa     | No Unitrac?')
console.log('-----|--------------------|-----------|-----------')
let presentes = 0
let ausentes = 0
for (const l of linhas) {
  const placa = (l.placa_norm ?? '').padEnd(9)
  const motorista = (l.motorista_nome ?? '').slice(0, 18).padEnd(18)
  const presente = placasUnitrac.has(l.placa_norm)
  if (presente) presentes++; else ausentes++
  console.log(`${String(l.loja_codigo_raw).padStart(4)} | ${motorista} | ${placa} | ${presente ? 'sim' : 'NÃO'}`)
}
console.log(`\nResumo: ${presentes} no Unitrac, ${ausentes} ausentes`)
