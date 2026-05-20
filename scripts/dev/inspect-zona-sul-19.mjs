import { readFile } from 'node:fs/promises'
import { parseEscalaZonaSul } from '../../src/lib/parsers/escala-zona-sul.ts'
import { parseUnitrac } from '../../src/lib/parsers/unitrac.ts'

const zsBuf = await readFile('C:/Users/media/Downloads/dia 19/ESCALA ZONA SUL - MAIO (6).xlsx')
const unitracBuf = await readFile('C:/Users/media/Downloads/dia 19/relatorio_9521.xlsx')

const linhas = await parseEscalaZonaSul(zsBuf.buffer.slice(zsBuf.byteOffset, zsBuf.byteOffset + zsBuf.byteLength), '2026-05-19')
const veiculos = await parseUnitrac(unitracBuf.buffer.slice(unitracBuf.byteOffset, unitracBuf.byteOffset + unitracBuf.byteLength))

const placasUnitrac = new Set(veiculos.map(v => v.placa_norm))
console.log(`\nZona Sul: ${linhas.length} linhas`)

let comPlaca = 0
let semPlaca = 0
let placaNoUnitrac = 0
let placaForaUnitrac = 0
const placasAusentes = new Set()

for (const l of linhas) {
  if (!l.placa_norm) { semPlaca++; continue }
  comPlaca++
  if (placasUnitrac.has(l.placa_norm)) placaNoUnitrac++
  else { placaForaUnitrac++; placasAusentes.add(l.placa_norm) }
}

console.log(`  Com placa: ${comPlaca}`)
console.log(`  Sem placa: ${semPlaca}`)
console.log(`  Placa no Unitrac: ${placaNoUnitrac}`)
console.log(`  Placa AUSENTE no Unitrac: ${placaForaUnitrac}`)
console.log(`  Placas únicas ausentes (${placasAusentes.size}):`, [...placasAusentes].join(', '))
