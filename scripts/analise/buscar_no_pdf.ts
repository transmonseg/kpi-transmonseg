import { readFileSync } from 'fs'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'

const placasFaltando = ['CZB9J19', 'KYM2I62', 'LCO0978', 'LJS2172', 'LNU7733', 'LNU9595', 'LQA5883', 'LQE5401', 'LTE0A64', 'MDV3746', 'QAH2H50']

async function main() {
  const buf = readFileSync('C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 19/relatorio_9572.pdf')
  const veiculos = await parseUnitracPdf(buf, new Set())
  console.log(`Veículos no PDF: ${veiculos.length}`)
  const placasPdf = new Set(veiculos.map(v => v.placa_norm))
  console.log(`Placas únicas: ${placasPdf.size}\n`)

  console.log('Verificação:')
  for (const p of placasFaltando) {
    if (placasPdf.has(p)) {
      const v = veiculos.find(x => x.placa_norm === p)!
      console.log(`  ✓ ${p} no PDF Unitrac com ${v.paradas.length} paradas`)
    } else {
      console.log(`  ❌ ${p} NÃO ESTÁ no PDF Unitrac`)
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
