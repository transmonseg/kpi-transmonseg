import { readFileSync } from 'fs'
import { parseUnitrac } from '@/lib/parsers/unitrac'

const placasFaltando = ['CZB9J19', 'KYM2I62', 'LCO0978', 'LJS2172', 'LNU7733', 'LNU9595', 'LQA5883', 'LQE5401', 'LTE0A64', 'MDV3746', 'QAH2H50']

async function main() {
  const buf = readFileSync('C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 19/relatorio_9391.xlsx')
  const veiculos = await parseUnitrac(buf)
  console.log(`Veículos parseados: ${veiculos.length}`)

  // Todas as placas no Unitrac (normalizadas)
  const placasUnitrac = new Set(veiculos.map(v => v.placa_norm))
  console.log(`Placas únicas: ${placasUnitrac.size}\n`)

  console.log('Verificação placa-por-placa (já normalizadas):')
  for (const p of placasFaltando) {
    if (placasUnitrac.has(p)) {
      const v = veiculos.find(x => x.placa_norm === p)!
      console.log(`  ✓ ${p} no Unitrac com ${v.paradas.length} paradas`)
    } else {
      // Tenta busca fuzzy: 6 últimos chars
      const tail = p.slice(-6)
      const fuzzy = [...placasUnitrac].filter(x => x.includes(tail) || x.endsWith(p.slice(-4)))
      console.log(`  ❌ ${p} NÃO ESTÁ. Fuzzy match (tail ${tail}): ${fuzzy.length === 0 ? '(nenhum)' : fuzzy.slice(0,3).join(', ')}`)
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
