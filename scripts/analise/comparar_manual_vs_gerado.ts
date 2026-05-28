/**
 * Compara KPIs manuais (Tia Erica) vs KPIs gerados pelo sistema (dia 19).
 * Casa loja por loja (nome normalizado) e compara os 3 horários do 1º carro:
 * SAIDA CD, CHD LOJA, SAIDA LOJA. Calcula taxa de acerto por rede.
 */
import ExcelJS from 'exceljs'

const MANUAL_DIR = 'C:/Users/media/Downloads/KPI SMANUAIS'
const GERADO_DIR = 'C:/Users/media/Downloads/gerado dia 19'

// [rede, arquivo manual, arquivo gerado]
const PARES: Array<[string, string, string]> = [
  ['ARMAZEM_GRAO', 'KPI ARMAZEM DO GRAO (2).xlsx', 'KPI-ARMAZEM_GRAO-2026-05-19 (9).xlsx'],
  ['ASSAI',        'KPI ASSAI (4).xlsx',           'KPI-ASSAI-2026-05-19 (4).xlsx'],
  ['ATACADAO',     'KPI ATACADAO (4).xlsx',        'KPI-ATACADAO-2026-05-19 (5).xlsx'],
  ['CARREFOUR',    'KPI CARREFOUR (4).xlsx',       'KPI-CARREFOUR-2026-05-19 (4).xlsx'],
  ['GUANABARA',    'KPI GUANABARA (4).xlsx',       'KPI-GUANABARA-2026-05-19 (9).xlsx'],
  ['PREZUNIC',     'KPI PREZUNIC (6).xlsx',        'KPI-PREZUNIC-2026-05-19 (4).xlsx'],
  ['PRINCESA',     'KPI PRINCESA (11).xlsx',       'KPI-PRINCESA-2026-05-19 (11).xlsx'],
  ['SUPER_PAX',    'KPI SUPERPAX.xlsx',            'KPI-SUPER_PAX-2026-05-19 (4).xlsx'],
  ['SUPERPRIX',    'KPI SUPERPRIX (4).xlsx',       'KPI-SUPERPRIX-2026-05-19 (5).xlsx'],
  ['ZONA_SUL',     'KPI ZONA SUL.xlsx',            'KPI-ZONA_SUL-2026-05-19 (9).xlsx'],
]

const TOLERANCIA_MIN = 15

function norm(s: string): string {
  let x = s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/FILIAL/g, 'F').replace(/\bLOJA\b/g, '').replace(/[^A-Z0-9]+/g, ' ').trim()
  // Remove prefixo de rede no início (manual usa "Pax X" / "Gb X", gerado às vezes não)
  x = x.replace(/^(PAX|GB|ASSAI|SENDAS|PREZUNIC|CARREFOUR|PRINCESA|SUPERPRIX|ATACADAO|GUANABARA|VIANENSE|SAM ?S|MUNDIAL|ZONA SUL)\s+/, '')
  // Remove sufixo "2 CARRO" / numero de filial isolado no fim que vaza
  x = x.replace(/\s*\d*\s*CARRO.*$/, '').trim()
  return x
}

function cellText(v: any): string {
  if (v == null) return ''
  if (v instanceof Date) {
    const hh = String(v.getUTCHours()).padStart(2, '0')
    const mm = String(v.getUTCMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
  }
  if (typeof v === 'object') {
    if (v.text) return String(v.text)
    if (v.result != null) return cellText(v.result)
    if (v.richText) return v.richText.map((r: any) => r.text).join('')
    return ''
  }
  return String(v).trim()
}

function toMin(s: string): number | null {
  const m = s.match(/(\d{1,2}):(\d{2})/)
  if (!m) return null
  return parseInt(m[1]) * 60 + parseInt(m[2])
}

type Estado = { tipo: 'horario' | 'sem_rastreador' | 'nao_foi' | 'vazio'; cd: number | null; chd: number | null; sai: number | null }
type Cols = { cd: number; chd: number; sai: number; ini: number; fim: number }

// Acha as colunas SAIDA CD / CHD LOJA / SAIDA LOJA pelo texto do header (1º carro)
function acharColunas(ws: ExcelJS.Worksheet, headerRow: number): Cols {
  let cd = -1, chd = -1, sai = -1
  const row = ws.getRow(headerRow)
  // Só o 1º carro — para na primeira ocorrência de cada (sentinela -1)
  for (let c = 1; c <= ws.columnCount; c++) {
    const t = cellText(row.getCell(c).value).toUpperCase().replace(/\s+/g, ' ')
    if (/SAIDA\s*CD/.test(t) && cd === -1) cd = c
    else if (/CH?D\s*LOJA|CHEGAD/.test(t) && chd === -1) chd = c
    else if (/SAIDA\s*LOJA/.test(t) && sai === -1) sai = c
  }
  if (cd === -1) cd = 5
  if (chd === -1) chd = 6
  if (sai === -1) sai = 7
  return { cd, chd, sai, ini: Math.min(cd, chd, sai), fim: Math.max(cd, chd, sai) + 1 }
}

function estadoLinha(row: ExcelJS.Row, cols: Cols): Estado {
  // Junta as células do range pra detectar SEM RASTREADOR / NÃO FOI (vazam entre células)
  const textos: string[] = []
  for (let c = cols.ini; c <= cols.fim; c++) textos.push(cellText(row.getCell(c).value).toUpperCase())
  const junto = textos.join(' ')
  if (/SEM\s*RASTREAD/.test(junto)) return { tipo: 'sem_rastreador', cd: null, chd: null, sai: null }
  if (/N[ÃA]O\s*FOI/.test(junto)) return { tipo: 'nao_foi', cd: null, chd: null, sai: null }
  const cd = toMin(cellText(row.getCell(cols.cd).value))
  const chd = toMin(cellText(row.getCell(cols.chd).value))
  const sai = toMin(cellText(row.getCell(cols.sai).value))
  if (cd == null && chd == null && sai == null) return { tipo: 'vazio', cd: null, chd: null, sai: null }
  return { tipo: 'horario', cd, chd, sai }
}

function lerLojas(ws: ExcelJS.Worksheet): Map<string, Estado> {
  const mapa = new Map<string, Estado>()
  let headerRow = -1
  for (let r = 1; r <= Math.min(ws.rowCount, 10); r++) {
    if (/REDES|FILIAIS/i.test(cellText(ws.getRow(r).getCell(1).value))) { headerRow = r; break }
  }
  if (headerRow === -1) headerRow = 3
  const cols = acharColunas(ws, headerRow)
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const loja = cellText(ws.getRow(r).getCell(1).value)
    if (!loja || /^REDES|TOTAL|^\s*$/.test(loja)) continue
    const key = norm(loja)
    if (!key) continue
    if (!mapa.has(key)) mapa.set(key, estadoLinha(ws.getRow(r), cols))
  }
  return mapa
}

function batemTempos(a: Estado, b: Estado): boolean {
  if (a.tipo !== b.tipo) return false
  if (a.tipo !== 'horario') return true // sem_rastreador/nao_foi/vazio iguais = acerto
  const campos: Array<keyof Estado> = ['cd', 'chd', 'sai']
  for (const f of campos) {
    const av = a[f] as number | null, bv = b[f] as number | null
    if (av == null && bv == null) continue
    if (av == null || bv == null) return false
    if (Math.abs(av - bv) > TOLERANCIA_MIN) return false
  }
  return true
}

async function main() {
  const linhas: Array<{ rede: string; lojasComuns: number; acertos: number; pct: number; soManual: number; soGerado: number; detalhes: string[] }> = []

  for (const [rede, fManual, fGerado] of PARES) {
    const wbM = new ExcelJS.Workbook(); await wbM.xlsx.readFile(`${MANUAL_DIR}/${fManual}`)
    const wbG = new ExcelJS.Workbook(); await wbG.xlsx.readFile(`${GERADO_DIR}/${fGerado}`)
    const wsM = wbM.getWorksheet('19') ?? wbM.worksheets[0]
    const wsG = wbG.worksheets[0]

    const lojasM = lerLojas(wsM)
    const lojasG = lerLojas(wsG)

    let comuns = 0, acertos = 0
    const detalhes: string[] = []
    for (const [key, estM] of lojasM) {
      const estG = lojasG.get(key)
      if (!estG) continue
      comuns++
      if (batemTempos(estM, estG)) acertos++
      else {
        const fmt = (e: Estado) => e.tipo === 'horario' ? `${e.cd ?? '-'}/${e.chd ?? '-'}/${e.sai ?? '-'}` : e.tipo
        detalhes.push(`${key}: manual[${fmt(estM)}] ≠ gerado[${fmt(estG)}]`)
      }
    }
    const soManual = [...lojasM.keys()].filter(k => !lojasG.has(k)).length
    const soGerado = [...lojasG.keys()].filter(k => !lojasM.has(k)).length
    const pct = comuns > 0 ? Math.round(100 * acertos / comuns) : 0
    linhas.push({ rede, lojasComuns: comuns, acertos, pct, soManual, soGerado, detalhes })
  }

  // Tabela
  console.log('\n| Rede | Lojas comparadas | Acertos | Taxa | Só manual | Só gerado |')
  console.log('|------|------------------|---------|------|-----------|-----------|')
  let totC = 0, totA = 0
  for (const l of linhas) {
    console.log(`| ${l.rede} | ${l.lojasComuns} | ${l.acertos} | ${l.pct}% | ${l.soManual} | ${l.soGerado} |`)
    totC += l.lojasComuns; totA += l.acertos
  }
  console.log(`| **TOTAL** | **${totC}** | **${totA}** | **${Math.round(100*totA/totC)}%** | | |`)

  console.log('\n\n=== DIVERGÊNCIAS (até 8 por rede) ===')
  for (const l of linhas) {
    if (l.detalhes.length === 0) continue
    console.log(`\n## ${l.rede} (${l.detalhes.length} divergências)`)
    for (const d of l.detalhes.slice(0, 8)) console.log('  -', d)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
