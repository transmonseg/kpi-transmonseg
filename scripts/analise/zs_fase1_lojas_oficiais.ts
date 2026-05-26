// Fase 1.1: extrai 48 lojas oficiais da aba endereço filiais
import { readFileSync } from 'fs'
import * as XLSX from 'xlsx'

const MAN = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/INTENSIVA/KPIS_MANUAIS_REFERENCIA/KPI ZONA SUL-MANUAL.xlsx'

interface LojaOficial { numero: string; bairro: string; endereco: string }

const wb = XLSX.read(readFileSync(MAN), { type: 'buffer' })
const ws = wb.Sheets['endereço filiais']
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as any[][]

const lojas: LojaOficial[] = []
function parseCell(loja: string, end: string) {
  if (!loja || !end) return null
  const m = loja.match(/LOJA\s*-?\s*(\w+)\s*-?\s*(.*)/i)
  if (!m) {
    // "CENTRAL (CD) - OLARIA", "GARAGEM - PENHA", "MEGA BOX - OLARIA"
    const m2 = loja.match(/^(\w+(?:\s+\w+)*?)\s*[-—]\s*(.+)/)
    if (m2) return { numero: m2[1].trim(), bairro: m2[2].trim(), endereco: end.trim() }
    return { numero: loja.trim(), bairro: '', endereco: end.trim() }
  }
  return { numero: m[1].trim(), bairro: m[2].trim(), endereco: end.trim() }
}

for (const r of rows) {
  if (!r) continue
  // Coluna esquerda: A=loja, B=endereço
  const lojaL = String(r[0] ?? '').trim()
  const endL = String(r[1] ?? '').trim()
  const parseL = parseCell(lojaL, endL)
  if (parseL && !/LOJAS|OUTROS/i.test(parseL.numero)) lojas.push(parseL)
  // Coluna direita: D=loja, E=endereço
  const lojaR = String(r[3] ?? '').trim()
  const endR = String(r[4] ?? '').trim()
  const parseR = parseCell(lojaR, endR)
  if (parseR && !/LOJAS|OUTROS/i.test(parseR.numero)) lojas.push(parseR)
}

console.log(`Total lojas oficiais: ${lojas.length}\n`)
for (const l of lojas) {
  console.log(`  ${l.numero.padEnd(8)} ${l.bairro.padEnd(20)} ${l.endereco.slice(0, 80)}`)
}
