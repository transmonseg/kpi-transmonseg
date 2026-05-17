/**
 * Reconciliação escala vs KPI gerado.
 * Uso: node scripts/reconciliar-kpi.mjs <pasta-escalas> <pasta-kpis> <YYYY-MM-DD>
 * Ex:  node scripts/reconciliar-kpi.mjs "C:/Users/media/Downloads/ESCALAS" "C:/Users/media/Downloads/KPIS GERADAS" 2026-05-15
 */

import ExcelJS from '../node_modules/exceljs/dist/es5/exceljs.nodejs.js'
import { readdir } from 'fs/promises'
import path from 'path'

const [, , pastaEscalas, pastaKpis, dataAlvo] = process.argv
if (!pastaEscalas || !pastaKpis || !dataAlvo) {
  console.error('Uso: node scripts/reconciliar-kpi.mjs <pasta-escalas> <pasta-kpis> <YYYY-MM-DD>')
  process.exit(1)
}

function cellVal(cell) {
  const v = cell.value
  if (!v) return null
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map(r => r.text).join('')
    if ('text' in v) return v.text
    if ('result' in v) return v.result
  }
  return v
}

function normText(s) {
  return String(s).normalize('NFD').replace(/\p{M}/gu, '').toUpperCase().replace(/\s+/g, ' ').trim()
}

// Normaliza nome de loja para comparação: remove ●, strip espaços extras
function normNomeLoja(s) {
  return String(s).replace(/●/g, '').replace(/\s+/g, ' ').trim()
}

function detectRedeFromNome(nome) {
  const n = normText(nome)
  if (n.includes('ASSAI')) return 'ASSAI'
  if (n.includes('ATACADAO')) return 'ATACADAO'
  if (n.includes('CARREFOUR')) return 'CARREFOUR'
  if (n.includes('PREZUNIC')) return 'PREZUNIC'
  if (n.includes('PRINCESA')) return 'PRINCESA'
  if (n.includes('GUANABARA')) return 'GUANABARA'
  if (n.includes("SAM'S") || (n.includes('SAM') && n.includes('CLUB'))) return 'SAMS_CLUB'
  if (n.includes('VIANENSE')) return 'VIANENSE'
  if (n.includes('CAB') && n.includes('PETROPOLIS')) return 'CAB_PETROPOLIS'
  if (n.includes('SENDAS')) return 'SENDAS'
  if (n.includes('FEIRA NOVA')) return 'FEIRA_NOVA'
  if (n.includes('EMANUEL')) return 'EMANUEL'
  if (n.includes('ARMAZEM') && n.includes('GRAO')) return 'ARMAZEM_GRAO'
  if (n.includes('SUPER PAX') || n.includes('SUPERPAX')) return 'SUPER_PAX'
  if (n.includes('SUPERPRIX') || n.includes('SUPER PRIX')) return 'SUPERPRIX'
  if (n.includes('MUNDIAL')) return 'MUNDIAL'
  if (n.includes('ZONA SUL')) return 'ZONA_SUL'
  return null
}

// Lê um KPI XLSX e retorna Map<loja_nome, { temDado: boolean }>
async function lerKpi(filepath) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filepath)
  const ws = wb.getWorksheet(wb.worksheets[0].name)
  const lojas = new Map()
  ws.eachRow((row, rn) => {
    if (rn <= 4) return
    const v1 = cellVal(row.getCell(1))
    if (!v1 || !String(v1).trim()) return
    const motor = cellVal(row.getCell(2))
    const placa = cellVal(row.getCell(4))
    const temDado = !!(motor || placa)
    lojas.set(normNomeLoja(String(v1).trim()), { temDado })
  })
  return lojas
}

// Lê escala geral/PAX (abas numéricas) para a data-alvo
async function lerEscalaAbas(filepath, dataAlvo) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filepath)

  const dia = String(parseInt(dataAlvo.split('-')[2]))
  let ws = null
  wb.eachSheet(s => { if (s.name.trim() === dia) ws = s })
  if (!ws) return []

  const linhas = []
  let rede = null
  let modoBenassi = false

  ws.eachRow((row, rn) => {
    if (rn <= 4) return
    const v1 = String(cellVal(row.getCell(1)) || '').trim()
    const v4 = cellVal(row.getCell(4))
    const v4s = v4 != null ? String(v4).trim() : null
    if (!v1) return
    const n = normText(v1)
    // Filtra linhas de cabeçalho/totais independente de ser separador ou não
    if (n.startsWith('TOTAL') || (n.includes('REDES') && n.includes('FILIAI'))) return
    const isSep = (v4s === v1) || v4 == null || v4s === '' || v4s === null
    if (isSep) {
      if (n.includes('BENASSI')) { modoBenassi = true; rede = 'SENDAS'; return }
      if (n.includes('FORA ESCALA')) { modoBenassi = false; return }
      const r = detectRedeFromNome(v1)
      if (r) { rede = r; modoBenassi = false }
      return
    }
    const redeFromNome = detectRedeFromNome(v1)
    const effectiveRede = redeFromNome || rede || 'DESCONHECIDO'
    linhas.push({ loja: normNomeLoja(v1), rede: effectiveRede })
  })
  return linhas
}

async function main() {
  const arquivosEscala = (await readdir(pastaEscalas)).filter(f =>
    f.toLowerCase().endsWith('.xlsx') && !f.startsWith('~')
  )
  const arquivosKpi = (await readdir(pastaKpis)).filter(f =>
    f.includes(dataAlvo) && f.endsWith('.xlsx') &&
    !f.includes('(1)') && !f.includes('(2)') && !f.startsWith('~')
  )

  // Lê todas as escalas
  const escalaLinhas = []
  for (const f of arquivosEscala) {
    try {
      const fp = path.join(pastaEscalas, f)
      const linhas = await lerEscalaAbas(fp, dataAlvo)
      if (linhas.length > 0) {
        console.log(`[escala] ${f}: ${linhas.length} linhas`)
        escalaLinhas.push(...linhas)
      }
    } catch (e) {
      console.warn(`[escala] SKIP ${f}: ${e.message}`)
    }
  }

  // Agrupa escala por rede → Set de lojas únicas
  const escalaByRede = new Map()
  for (const { loja, rede } of escalaLinhas) {
    if (!escalaByRede.has(rede)) escalaByRede.set(rede, new Set())
    escalaByRede.get(rede).add(loja)
  }

  // Lê todos os KPIs
  const kpiByRede = new Map()
  for (const f of arquivosKpi) {
    const m = f.match(/KPI-([A-Z_]+)-/)
    if (!m) continue
    const rede = m[1]
    try {
      const fp = path.join(pastaKpis, f)
      const lojas = await lerKpi(fp)
      kpiByRede.set(rede, lojas)
      const comDado = [...lojas.values()].filter(v => v.temDado).length
      console.log(`[kpi]    ${f}: ${lojas.size} lojas (${comDado} com dado)`)
    } catch (e) {
      console.warn(`[kpi] SKIP ${f}: ${e.message}`)
    }
  }

  // Relatório
  console.log(`\n${'='.repeat(60)}`)
  console.log(`RECONCILIAÇÃO KPI vs ESCALA — ${dataAlvo}`)
  console.log('='.repeat(60))

  const todasRedes = new Set([...escalaByRede.keys(), ...kpiByRede.keys()])
  let totalOk = 0, totalWarn = 0

  for (const rede of [...todasRedes].sort()) {
    const escLojas = escalaByRede.get(rede) ?? new Set()
    const kpiLojas = kpiByRede.get(rede) ?? new Map()
    const kpiComDado = [...kpiLojas.entries()].filter(([, v]) => v.temDado).map(([k]) => k)

    const emEscalaSemKpi = [...escLojas].filter(l => {
      const entry = kpiLojas.get(normNomeLoja(l))
      return !entry || !entry.temDado
    })

    const status = emEscalaSemKpi.length === 0 ? '✅' : '⚠️ '
    if (emEscalaSemKpi.length === 0) totalOk++ ; else totalWarn++

    console.log(`\n${status} ${rede}`)
    console.log(`   Escala: ${escLojas.size} lojas únicas  |  KPI total: ${kpiLojas.size}  |  Com GPS/dado: ${kpiComDado.length}`)

    if (emEscalaSemKpi.length > 0) {
      console.log(`   ⚠️  NA ESCALA MAS SEM DADO NO KPI (${emEscalaSemKpi.length}):`)
      emEscalaSemKpi.forEach(l => console.log(`      - ${l}`))
    }

    if (!escalaByRede.has(rede) && kpiLojas.size > 0) {
      console.log(`   ℹ️  Rede só no KPI (escala pode ser de outro formato — Guanabara PDF, Zona Sul, Armazém)`)
    }
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log(`RESUMO: ${totalOk} redes OK, ${totalWarn} redes com divergência`)
  console.log('='.repeat(60) + '\n')
}

main().catch(e => { console.error(e); process.exit(1) })
