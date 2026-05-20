import { readFile } from 'node:fs/promises'
import { parseUnitrac } from '../../src/lib/parsers/unitrac.ts'
import { parseUnitracPdf } from '../../src/lib/parsers/unitrac-pdf.ts'

const xlsxBuf = await readFile('C:/Users/media/Downloads/dia 19/relatorio_9521.xlsx')
const pdfBuf = await readFile('C:/Users/media/Downloads/dia 19/relatorio_9522.pdf')

const xlsx = await parseUnitrac(xlsxBuf.buffer.slice(xlsxBuf.byteOffset, xlsxBuf.byteOffset + xlsxBuf.byteLength))
const pdf = await parseUnitracPdf(pdfBuf)

const placa = 'LSL9670'

const fmtBRT = d => d ? `${String((d.getUTCHours()-3+24)%24).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}` : '—'

const vx = xlsx.find(v => v.placa_norm === placa)
const vp = pdf.find(v => v.placa_norm === placa)

console.log(`\n=== Placa ${placa} ===\n`)
console.log(`XLSX: ${vx?.paradas.length ?? 0} paradas`)
console.log(`PDF:  ${vp?.paradas.length ?? 0} paradas`)

console.log('\n--- XLSX ---')
for (const p of vx?.paradas ?? []) {
  console.log(`  ${p.classificacao.padEnd(10)} ${fmtBRT(p.chegada)}-${fmtBRT(p.saida)}  ${(p.nome_loja ?? p.local_parada ?? '').slice(0, 50)}`)
}
console.log('\n--- PDF ---')
for (const p of vp?.paradas ?? []) {
  console.log(`  ${p.classificacao.padEnd(10)} ${fmtBRT(p.chegada)}-${fmtBRT(p.saida)}  ${(p.nome_loja ?? p.local_parada ?? '').slice(0, 50)}`)
}
