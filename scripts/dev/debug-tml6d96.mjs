// Investigar por que TML6D96 (Armazém, 4 lojas escala) só matched 1
import { readFile } from 'node:fs/promises'
import { parseUnitrac } from '../../src/lib/parsers/unitrac.ts'

const buf = await readFile('C:/Users/media/Downloads/dia 19/relatorio_9521.xlsx')
const veiculos = await parseUnitrac(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))

const v = veiculos.find(x => x.placa_norm === 'TML6D96')
console.log(`Placa TML6D96: ${v?.paradas.length} paradas totais`)
const fmtBRT = d => d ? `${String((d.getUTCHours()-3+24)%24).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}` : '—'

for (const p of v?.paradas ?? []) {
  console.log(`  ${p.classificacao.padEnd(10)} ${fmtBRT(p.chegada)}-${fmtBRT(p.saida)} | cod=${(p.codigo_loja ?? '—').padEnd(10)} | ${(p.nome_loja ?? p.local_parada ?? '').slice(0,60)}`)
}

// Quantas LOJA com codigos únicos?
const paradasLoja = v?.paradas.filter(p => p.classificacao === 'LOJA') ?? []
console.log(`\nLOJA total: ${paradasLoja.length}`)
const codsUnicos = new Set(paradasLoja.map(p => p.codigo_loja).filter(Boolean))
console.log(`Códigos únicos: ${codsUnicos.size} (${[...codsUnicos].join(', ')})`)
