// Compara KPIs gerados pelo pipeline (out/dia-19/) contra os KPI TESTE
// gerados anteriormente pelo sistema em produção (sem alterações).
//
// Formato dos XLSX (idêntico nos dois):
//   R1: título
//   R2: grupo de carro 1 / 2
//   R3: headers (REDES/FILIAIS | MOTORISTA | COD | PLACA | SAIDA CD | CHD LOJA | SAIDA LOJA | ... | TEMPO 1 | TEMPO 2)
//   R4: spacer
//   R5+: dados

import { readFile } from 'node:fs/promises'
import ExcelJS from 'exceljs'

const REDES = [
  'ARMAZEM_GRAO', 'ASSAI', 'ATACADAO', 'CAB_PETROPOLIS', 'CARREFOUR',
  'GUANABARA', 'MUNDIAL', 'PREZUNIC', 'PRINCESA', 'SAMS_CLUB',
  'SENDAS', 'SUPERPRIX', 'VIANENSE', 'ZONA_SUL',
]

const ESPERADO_DIR = 'C:/Users/media/Downloads/DIA 19 KPI TESTE'
const GERADO_DIR = 'C:/Users/media/dev/kpi-transmonseg/out/dia-19'
const DATA = '2026-05-19'

type Linha = {
  loja: string
  motorista1: string
  cod1: string
  placa1: string
  saidaCd1: string
  chdLoja1: string
  saidaLoja1: string
  motorista2: string
  cod2: string
  placa2: string
  saidaCd2: string
  chdLoja2: string
  saidaLoja2: string
  tempo1: string
  tempo2: string
}

function fmt(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined || v === '') return ''
  if (typeof v === 'number') {
    // hora em formato fração de dia
    if (v >= 0 && v < 1) {
      const h = Math.floor(v * 24)
      const m = Math.round((v * 24 - h) * 60)
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    }
    return String(v)
  }
  if (typeof v === 'object' && v !== null && 'result' in v) {
    return fmt((v as { result: ExcelJS.CellValue }).result)
  }
  return String(v).trim()
}

async function readKpi(path: string): Promise<Linha[]> {
  const buf = await readFile(path)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)
  const ws = wb.worksheets[0]
  if (!ws) return []
  const linhas: Linha[] = []
  for (let r = 5; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const loja = fmt(row.getCell(1).value)
    if (!loja) continue
    linhas.push({
      loja,
      motorista1: fmt(row.getCell(2).value),
      cod1: fmt(row.getCell(3).value),
      placa1: fmt(row.getCell(4).value),
      saidaCd1: fmt(row.getCell(5).value),
      chdLoja1: fmt(row.getCell(6).value),
      saidaLoja1: fmt(row.getCell(7).value),
      motorista2: fmt(row.getCell(8).value),
      cod2: fmt(row.getCell(9).value),
      placa2: fmt(row.getCell(10).value),
      saidaCd2: fmt(row.getCell(11).value),
      chdLoja2: fmt(row.getCell(12).value),
      saidaLoja2: fmt(row.getCell(13).value),
      tempo1: fmt(row.getCell(14).value),
      tempo2: fmt(row.getCell(15).value),
    })
  }
  return linhas
}

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
}

type Diff = { campo: string; esp: string; ger: string }

function diff(esp: Linha, ger: Linha): Diff[] {
  const out: Diff[] = []
  const campos: Array<keyof Linha> = ['motorista1','cod1','placa1','saidaCd1','chdLoja1','saidaLoja1','motorista2','cod2','placa2','saidaCd2','chdLoja2','saidaLoja2','tempo1','tempo2']
  for (const c of campos) {
    const e = esp[c]
    const g = ger[c]
    if (norm(e) !== norm(g)) out.push({ campo: c, esp: e, ger: g })
  }
  return out
}

async function main() {
  console.log('\n━━━ COMPARAÇÃO KPI gerado vs KPI TESTE (dia 19/05) ━━━\n')

  let totalEsp = 0
  let totalGer = 0
  let totalIguais = 0
  let totalParcial = 0
  let totalSoEsp = 0
  let totalSoGer = 0

  const detalhes: Array<{ rede: string; iguais: number; total: number; problemas: string[] }> = []

  for (const rede of REDES) {
    const espPath = await findFile(ESPERADO_DIR, `KPI-${rede}-${DATA}`)
    const gerPath = `${GERADO_DIR}/KPI-${rede}-${DATA}.xlsx`
    if (!espPath) {
      console.log(`  [${rede}] sem KPI TESTE`)
      continue
    }

    const esp = await readKpi(espPath)
    const ger = await readKpi(gerPath).catch(() => [] as Linha[])

    totalEsp += esp.length
    totalGer += ger.length

    // Indexa por loja + ordem (duas lojas com mesmo nome aparecem em rows diferentes)
    const espIdx = new Map<string, Linha>()
    const gerIdx = new Map<string, Linha>()
    const contaEsp: Record<string, number> = {}
    const contaGer: Record<string, number> = {}
    for (const l of esp) {
      const base = norm(l.loja)
      contaEsp[base] = (contaEsp[base] ?? 0) + 1
      espIdx.set(`${base}#${contaEsp[base]}`, l)
    }
    for (const l of ger) {
      const base = norm(l.loja)
      contaGer[base] = (contaGer[base] ?? 0) + 1
      gerIdx.set(`${base}#${contaGer[base]}`, l)
    }

    const todasLojas = new Set<string>([...espIdx.keys(), ...gerIdx.keys()])
    const probs: string[] = []
    let iguais = 0
    let parcial = 0
    let soEsp = 0
    let soGer = 0

    for (const k of todasLojas) {
      const e = espIdx.get(k)
      const g = gerIdx.get(k)
      if (e && !g) { soEsp++; probs.push(`  [só-esperado] ${e.loja}`); continue }
      if (g && !e) { soGer++; probs.push(`  [só-gerado]   ${g.loja}`); continue }
      if (!e || !g) continue
      const diffs = diff(e, g)
      if (diffs.length === 0) iguais++
      else {
        parcial++
        const dShort = diffs.slice(0, 4).map(d => `${d.campo}: '${d.esp}'→'${d.ger}'`).join(' / ')
        probs.push(`  [diff] ${e.loja}  ${dShort}${diffs.length > 4 ? ` +${diffs.length - 4}` : ''}`)
      }
    }

    totalIguais += iguais
    totalParcial += parcial
    totalSoEsp += soEsp
    totalSoGer += soGer

    const pct = esp.length > 0 ? Math.round((iguais / esp.length) * 100) : 0
    console.log(`\n[${rede.padEnd(15)}] esp=${esp.length} ger=${ger.length} | iguais=${iguais} (${pct}%) parcial=${parcial} só-esp=${soEsp} só-ger=${soGer}`)
    for (const p of probs) console.log(p)

    detalhes.push({ rede, iguais, total: esp.length, problemas: probs })
  }

  console.log('\n━━━ TOTAL ━━━')
  const pctTotal = totalEsp > 0 ? Math.round((totalIguais / totalEsp) * 100) : 0
  console.log(`  Esperadas (KPI TESTE):  ${totalEsp}`)
  console.log(`  Geradas hoje:           ${totalGer}`)
  console.log(`  Linhas idênticas:       ${totalIguais} (${pctTotal}% das esperadas)`)
  console.log(`  Linhas parciais (mesmo loja, dados diferentes): ${totalParcial}`)
  console.log(`  Só no esperado (faltam): ${totalSoEsp}`)
  console.log(`  Só no gerado (extras):   ${totalSoGer}`)
}

async function findFile(dir: string, prefix: string): Promise<string | null> {
  const { readdir } = await import('node:fs/promises')
  const files = await readdir(dir)
  const m = files.find(f => f.startsWith(prefix))
  return m ? `${dir}/${m}` : null
}

main().catch(e => { console.error(e); process.exit(1) })
