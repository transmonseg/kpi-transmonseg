import { readFile } from 'node:fs/promises'
import { parseUnitracPdf } from '../src/lib/parsers/unitrac-pdf.ts'

const buf = await readFile('C:/Users/media/OneDrive/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/relatorios-unitrac/relatorio_9184.pdf')
const veiculos = await parseUnitracPdf(buf)
console.log('Total veiculos:', veiculos.length)
console.log('Total paradas:', veiculos.reduce((s,v) => s + v.paradas.length, 0))
console.log('\nPrimeiro veiculo:')
console.log(JSON.stringify(veiculos[0], null, 2))
