import { readFile } from 'node:fs/promises'
import { parseEscalaPax } from '../../src/lib/parsers/escala-pax.ts'

const buf = await readFile('C:/Users/media/Downloads/dia 19/ESCALA - PAX , FEIRA NOVA , EMANUEL.xlsx')
const linhas = await parseEscalaPax(buf.buffer, '2026-05-19')
console.log('Linhas dia 19:', linhas.length)
const redes = [...new Set(linhas.map(l => l.rede_id))]
console.log('Redes:', redes.join(', '))
for (const l of linhas.slice(0, 5)) {
  console.log(l.rede_id, '|', l.loja_nome_raw, '|', l.placa_norm, '| data:', l.data)
}
