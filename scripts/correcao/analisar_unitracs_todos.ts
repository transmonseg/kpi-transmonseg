/**
 * Analisa TODOS os relatórios Unitrac (dias 18-22) — distribuição BASE/FORA/LOJA-named.
 * Coleta amostras dos "Local da Parada" pra eu (Claude) interpretar.
 */
import ExcelJS from 'exceljs'
 
const XLSX = require('xlsx') as typeof import('xlsx')

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA'

const RELATORIOS = [
  { dia: 18, path: `${BASE}/ESCALA DIA 18/relatorio_9402.xlsx` },
  { dia: 19, path: `${BASE}/ESCALA DIA 19/relatorio_9391.xlsx` },
  { dia: 20, path: `${BASE}/ESCALA DIA 20/relatorio_9573.xlsx` },
  { dia: 21, path: `${BASE}/ESCALA DIA 21/relatorio_9552.xlsx` },
  { dia: 22, path: `${BASE}/ESCALA DIA 22/relatorio_9588.xlsx` },
]

async function analisar(path: string): Promise<{
  abas: number
  paradas: number
  base: number
  fora: number
  lojaNamed: number
  placasComGeofence: number
  placasSemGeofence: number
  nomesLoja: Map<string, number>  // freq de cada nome
}> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  let paradas = 0, base = 0, fora = 0, lojaNamed = 0
  let placasComGeofence = 0, placasSemGeofence = 0
  const nomesLoja = new Map<string, number>()

  for (const sheet of wb.worksheets) {
    let lojaNoSheet = 0
    for (let r = 7; r <= sheet.rowCount; r++) {
      const local = String(sheet.getRow(r).getCell(11).value ?? '').trim()
      if (!local) continue
      paradas++
      if (local.includes('BASE BENASSI')) base++
      else if (local.includes('FORA DE BASE')) fora++
      else {
        lojaNamed++
        lojaNoSheet++
        nomesLoja.set(local, (nomesLoja.get(local) ?? 0) + 1)
      }
    }
    if (lojaNoSheet > 0) placasComGeofence++
    else placasSemGeofence++
  }

  return {
    abas: wb.worksheets.length,
    paradas, base, fora, lojaNamed,
    placasComGeofence, placasSemGeofence,
    nomesLoja,
  }
}

async function main() {
  console.log('=== ANÁLISE DE 5 RELATÓRIOS UNITRAC (DIAS 18-22) ===\n')

  const resultados: Array<{ dia: number; analise: Awaited<ReturnType<typeof analisar>> }> = []
  const todasLojas = new Map<string, number>()  // freq global de cada nome

  for (const { dia, path } of RELATORIOS) {
    process.stdout.write(`Dia ${dia}... `)
    try {
      const a = await analisar(path)
      resultados.push({ dia, analise: a })
      for (const [nome, freq] of a.nomesLoja) {
        todasLojas.set(nome, (todasLojas.get(nome) ?? 0) + freq)
      }
      console.log('ok')
    } catch (e) {
      console.log('falhou:', (e as Error).message)
    }
  }

  console.log('\n=== TABELA RESUMO ===')
  console.log('dia | abas | paradas | BASE  | FORA  | LOJA  | placas_com_loja | placas_sem_loja | %sem')
  console.log('---')
  for (const { dia, analise: a } of resultados) {
    const pctSem = ((a.placasSemGeofence / a.abas) * 100).toFixed(0)
    console.log(`${dia} | ${String(a.abas).padStart(4)} | ${String(a.paradas).padStart(7)} | ${String(a.base).padStart(5)} | ${String(a.fora).padStart(5)} | ${String(a.lojaNamed).padStart(5)} | ${String(a.placasComGeofence).padStart(15)} | ${String(a.placasSemGeofence).padStart(15)} | ${pctSem}%`)
  }
  console.log('')

  // Top 30 lojas mais frequentes em todos os dias (geofence Unitrac)
  console.log('=== TOP 30 LOJAS GEOFENCED NO UNITRAC (somando todos dias) ===\n')
  const top = [...todasLojas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)
  for (const [nome, freq] of top) {
    console.log(`  ${String(freq).padStart(3)}x  ${nome}`)
  }

  console.log(`\nTotal de lojas DISTINTAS no geofence Unitrac (5 dias): ${todasLojas.size}`)
}

main().catch(e => { console.error(e); process.exit(1) })
