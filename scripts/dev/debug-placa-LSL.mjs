import { readFile } from 'node:fs/promises'
import { parseUnitrac } from '../../src/lib/parsers/unitrac.ts'

const buf = await readFile('C:/Users/media/Downloads/dia 19/relatorio_9521.xlsx')
const veiculos = await parseUnitrac(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))

const placa = 'LSL9670'
const v = veiculos.find(x => x.placa_norm === placa)
if (!v) { console.log('não encontrada'); process.exit() }

console.log(`Placa ${placa}: ${v.paradas.length} paradas total`)
console.log()
for (const p of v.paradas) {
  const h = (d) => d ? `${String((d.getUTCHours()-3+24)%24).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}` : '—'
  console.log(`  ${p.classificacao.padEnd(10)} ${h(p.chegada)}-${h(p.saida)}  ${(p.nome_loja ?? p.local_parada ?? '').slice(0, 60)}`)
}
