// Inspeciona estrutura bruta de cada arquivo dia 19 — abas, cabeçalhos,
// primeiras linhas. Gera relatório pra dar contexto aos agentes de auditoria.

import { readFile } from 'node:fs/promises'
import ExcelJS from 'exceljs'

const ROOT = 'C:/Users/media/Downloads/dia 19'
const FILES = [
  'ESCALA GERAL DE MAIO 1 (6).xlsx',
  'ESCALA - PAX , FEIRA NOVA , EMANUEL.xlsx',
  'ESCALA DO ARMAZÉM DO GRÃO MAIO (5).xlsx',
  'ESCALA ZONA SUL - MAIO (6).xlsx',
  'relatorio_9521.xlsx',
]

function fmt(v, max = 30) {
  if (v === null || v === undefined || v === '') return '·'
  let s = typeof v === 'object' && 'result' in v ? String(v.result ?? '·') : String(v)
  if (v instanceof Date) {
    s = `${String(v.getUTCHours()).padStart(2, '0')}:${String(v.getUTCMinutes()).padStart(2, '0')}`
  }
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

for (const file of FILES) {
  console.log('\n' + '═'.repeat(100))
  console.log(`▎ ${file}`)
  console.log('═'.repeat(100))

  const buf = await readFile(`${ROOT}/${file}`)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))

  console.log(`\nAbas (${wb.worksheets.length}): ${wb.worksheets.map(w => w.name).join(', ')}`)

  // Tenta encontrar aba "19" ou similar
  const aba19 = wb.getWorksheet('19') || wb.getWorksheet('019') || wb.worksheets.find(w => w.name.includes('19'))
  const aba = aba19 || wb.worksheets[0]
  if (!aba) continue

  console.log(`\nAba selecionada: "${aba.name}" — ${aba.rowCount} rows × ${aba.columnCount} cols`)

  // Mostra primeiras 8 rows com até 20 colunas
  for (let r = 1; r <= Math.min(8, aba.rowCount); r++) {
    const row = aba.getRow(r)
    const cells = []
    for (let c = 1; c <= Math.min(22, aba.columnCount); c++) {
      cells.push(fmt(row.getCell(c).value, 18))
    }
    console.log(`  R${String(r).padStart(2)}: ${cells.join(' | ')}`)
  }

  // Pra arquivos com várias abas que cobrem dias diferentes, mostra também aba MATRIZ ou catalogo
  if (file.includes('ZONA SUL')) {
    const matriz = wb.getWorksheet('MATRIZ')
    if (matriz) {
      console.log(`\n[MATRIZ] ${matriz.rowCount} rows × ${matriz.columnCount} cols — primeiras 5:`)
      for (let r = 1; r <= Math.min(5, matriz.rowCount); r++) {
        const row = matriz.getRow(r)
        const cells = []
        for (let c = 1; c <= Math.min(15, matriz.columnCount); c++) {
          cells.push(fmt(row.getCell(c).value, 22))
        }
        console.log(`  R${String(r).padStart(2)}: ${cells.join(' | ')}`)
      }
    }
  }
}
