/**
 * Compara KPI BETA (modo estrito, sem geo) vs KPI Manual (Tia) — dia 19.
 * Tolerância 10 min. Mede a PRECISÃO dos preenchidos: dos que o beta preencheu,
 * quantos batem com o manual.
 */
import ExcelJS from 'exceljs'

const MANUAL_DIR = 'C:/Users/media/Downloads/KPI SMANUAIS'
const BETA_DIR = 'docs/conversas-tia-erica/kpi-beta'
const DIA = '2026-05-19'
const TOL = 10

const PARES: Array<[string, string]> = [
  ['ARMAZEM_GRAO', 'KPI ARMAZEM DO GRAO (2).xlsx'],
  ['ASSAI',        'KPI ASSAI (4).xlsx'],
  ['ATACADAO',     'KPI ATACADAO (4).xlsx'],
  ['CARREFOUR',    'KPI CARREFOUR (4).xlsx'],
  ['GUANABARA',    'KPI GUANABARA (4).xlsx'],
  ['PREZUNIC',     'KPI PREZUNIC (6).xlsx'],
  ['PRINCESA',     'KPI PRINCESA (11).xlsx'],
  ['SUPER_PAX',    'KPI SUPERPAX.xlsx'],
  ['SUPERPRIX',    'KPI SUPERPRIX (4).xlsx'],
  ['ZONA_SUL',     'KPI ZONA SUL.xlsx'],
]

function norm(s: string): string {
  let x = s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/FILIAL/g, 'F').replace(/\bLOJA\b/g, '').replace(/[^A-Z0-9]+/g, ' ').trim()
  x = x.replace(/^(PAX|GB|ASSAI|SENDAS|PREZUNIC|CARREFOUR|PRINCESA|SUPERPRIX|ATACADAO|GUANABARA|VIANENSE|SAM ?S|MUNDIAL|ZONA SUL)\s+/, '')
  x = x.replace(/\s*\d*\s*CARRO.*$/, '').trim()
  return x
}
function cellText(v: any): string {
  if (v == null) return ''
  if (v instanceof Date) return `${String(v.getUTCHours()).padStart(2,'0')}:${String(v.getUTCMinutes()).padStart(2,'0')}`
  if (typeof v === 'object') { if (v.text) return String(v.text); if (v.result != null) return cellText(v.result); if (v.richText) return v.richText.map((r: any) => r.text).join(''); return '' }
  return String(v).trim()
}
function toMin(s: string): number | null { const m = s.match(/(\d{1,2}):(\d{2})/); return m ? parseInt(m[1])*60+parseInt(m[2]) : null }

type Cols = { cd: number; chd: number; sai: number; ini: number; fim: number }
function acharColunas(ws: ExcelJS.Worksheet, hr: number): Cols {
  let cd = -1, chd = -1, sai = -1
  const row = ws.getRow(hr)
  for (let c = 1; c <= ws.columnCount; c++) {
    const t = cellText(row.getCell(c).value).toUpperCase().replace(/\s+/g, ' ')
    if (/SAIDA\s*CD/.test(t) && cd === -1) cd = c
    else if (/CH?D\s*LOJA|CHEGAD/.test(t) && chd === -1) chd = c
    else if (/SAIDA\s*LOJA/.test(t) && sai === -1) sai = c
  }
  if (cd === -1) cd = 5; if (chd === -1) chd = 6; if (sai === -1) sai = 7
  return { cd, chd, sai, ini: Math.min(cd, chd, sai), fim: Math.max(cd, chd, sai) + 1 }
}
type Estado = { tipo: 'horario' | 'vazio' | 'sem_rastreador' | 'nao_foi'; cd: number | null; chd: number | null; sai: number | null }
function estadoLinha(row: ExcelJS.Row, cols: Cols): Estado {
  const textos: string[] = []
  for (let c = cols.ini; c <= cols.fim; c++) textos.push(cellText(row.getCell(c).value).toUpperCase())
  const junto = textos.join(' ')
  if (/SEM\s*RASTREAD/.test(junto)) return { tipo: 'sem_rastreador', cd: null, chd: null, sai: null }
  if (/N[ÃA]O\s*FOI/.test(junto)) return { tipo: 'nao_foi', cd: null, chd: null, sai: null }
  const cd = toMin(cellText(row.getCell(cols.cd).value)), chd = toMin(cellText(row.getCell(cols.chd).value)), sai = toMin(cellText(row.getCell(cols.sai).value))
  if (cd == null && chd == null && sai == null) return { tipo: 'vazio', cd: null, chd: null, sai: null }
  return { tipo: 'horario', cd, chd, sai }
}
function lerLojas(ws: ExcelJS.Worksheet): Map<string, Estado> {
  const mapa = new Map<string, Estado>()
  let hr = -1
  for (let r = 1; r <= Math.min(ws.rowCount, 10); r++) if (/REDES|FILIAIS/i.test(cellText(ws.getRow(r).getCell(1).value))) { hr = r; break }
  if (hr === -1) hr = 3
  const cols = acharColunas(ws, hr)
  for (let r = hr + 1; r <= ws.rowCount; r++) {
    const loja = cellText(ws.getRow(r).getCell(1).value)
    if (!loja || /^REDES|TOTAL|^\s*$/.test(loja)) continue
    const key = norm(loja); if (!key) continue
    if (!mapa.has(key)) mapa.set(key, estadoLinha(ws.getRow(r), cols))
  }
  return mapa
}
function temposBatem(a: Estado, b: Estado, campos: readonly ('cd'|'chd'|'sai')[]): boolean {
  for (const f of campos) {
    const av = a[f], bv = b[f]
    if (av == null && bv == null) continue
    if (av == null || bv == null) return false
    if (Math.abs(av - bv) > TOL) return false
  }
  return true
}

async function main() {
  console.log(`\nComparação BETA (estrito) × MANUAL — dia 19, tolerância ${TOL}min\n`)
  console.log('| Rede | Beta preencheu | Acerto 3 campos | Acerto entrega (chd+saí) | Perdidos |')
  console.log('|------|:---:|:---:|:---:|:---:|')
  const C3 = ['cd', 'chd', 'sai'] as const
  const CE = ['chd', 'sai'] as const
  let totPre = 0, tot3 = 0, totE = 0, totPerdidos = 0
  for (const [rede, fManual] of PARES) {
    const wbM = new ExcelJS.Workbook(); await wbM.xlsx.readFile(`${MANUAL_DIR}/${fManual}`)
    const wbB = new ExcelJS.Workbook(); await wbB.xlsx.readFile(`${BETA_DIR}/KPI-${rede}-${DIA}-BETA.xlsx`)
    const lojasM = lerLojas(wbM.getWorksheet('19') ?? wbM.worksheets[0])
    const lojasB = lerLojas(wbB.worksheets[0])

    let preencheu = 0, ok3 = 0, okE = 0, perdidos = 0
    for (const [key, eB] of lojasB) {
      const eM = lojasM.get(key)
      if (eB.tipo === 'horario') {
        preencheu++
        if (eM && eM.tipo === 'horario') {
          if (temposBatem(eB, eM, C3)) ok3++
          if (temposBatem(eB, eM, CE)) okE++
        }
      } else if (eM && eM.tipo === 'horario') perdidos++
    }
    const p3 = preencheu > 0 ? Math.round(100*ok3/preencheu) : 0
    const pE = preencheu > 0 ? Math.round(100*okE/preencheu) : 0
    console.log(`| ${rede} | ${preencheu} | ${ok3} (${p3}%) | ${okE} (${pE}%) | ${perdidos} |`)
    totPre += preencheu; tot3 += ok3; totE += okE; totPerdidos += perdidos
  }
  console.log(`| **TOTAL** | **${totPre}** | **${tot3} (${Math.round(100*tot3/totPre)}%)** | **${totE} (${Math.round(100*totE/totPre)}%)** | **${totPerdidos}** |`)
}
main().catch(e => { console.error(e); process.exit(1) })
