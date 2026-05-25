/**
 * Lista todas as abas (placas) do Unitrac e mostra distribuição de
 * categorias ("Local da Parada") por placa, pra eu entender o cenário real.
 */
import ExcelJS from 'exceljs'

const PATH = process.argv[2] || 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 22/relatorio_9588.xlsx'

async function main() {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(PATH)

  console.log(`Total abas: ${wb.worksheets.length}\n`)

  // Coletar estatísticas
  const dist: Array<{ placa: string; total: number; base: number; fora: number; loja: number; nomes: string[] }> = []

  for (const sheet of wb.worksheets) {
    const placa = sheet.name
    let base = 0, fora = 0, loja = 0
    const nomes = new Set<string>()
    let total = 0

    // Linha 7+ são paradas; coluna 11 (índice K) é "Local da Parada"
    for (let r = 7; r <= sheet.rowCount; r++) {
      const local = String(sheet.getRow(r).getCell(11).value ?? '').trim()
      if (!local) continue
      total++
      if (local.includes('BASE BENASSI')) base++
      else if (local.includes('FORA DE BASE')) fora++
      else {
        loja++
        nomes.add(local)
      }
    }

    dist.push({ placa, total, base, fora, loja, nomes: [...nomes] })
  }

  console.log('Distribuição (placas com mais "FORA DE BASE" no topo):\n')
  dist.sort((a, b) => b.fora - a.fora)

  console.log('placa       | total | BASE | FORA | LOJA-named | (exemplos de nomes)')
  console.log('---')
  for (const d of dist.slice(0, 50)) {
    const ex = d.nomes.slice(0, 3).join(' | ')
    console.log(`${d.placa.padEnd(12)} | ${String(d.total).padStart(5)} | ${String(d.base).padStart(4)} | ${String(d.fora).padStart(4)} | ${String(d.loja).padStart(10)} | ${ex.slice(0, 80)}`)
  }
  console.log('---')
  console.log(`Total placas: ${dist.length}`)
  const semGeofence = dist.filter(d => d.loja === 0).length
  console.log(`Placas SEM nenhuma loja com nome (só BASE/FORA): ${semGeofence}`)
  console.log(`Placas com pelo menos 1 loja com nome: ${dist.length - semGeofence}`)
}

main().catch(e => { console.error(e); process.exit(1) })
