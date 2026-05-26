/**
 * Compara KPI GUANABARA manual vs gerado do dia 19.
 * Ignora diferenças de tempo em loja até 10 min (não importantes).
 */
import ExcelJS from 'exceljs'

function cvCell(cell: ExcelJS.Cell | undefined): string {
  if (!cell) return ''
  const v = cell.value
  if (v == null) return ''
  if (typeof v === 'object' && 'richText' in v) return (v as any).richText.map((r: any) => r.text).join('').trim()
  if (typeof v === 'object' && 'text' in v) return String((v as any).text).trim()
  return String(v).trim()
}

function fmtTime(cell: ExcelJS.Cell | undefined): string {
  if (!cell) return '---'
  const v = cell.value
  if (v == null) return '---'
  if (v instanceof Date) {
    const h = v.getUTCHours()
    const m = v.getUTCMinutes()
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  if (typeof v === 'number' && v >= 0 && v < 1) {
    const total = Math.round(v * 86400)
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  if (typeof v === 'object' && 'result' in v) return fmtTime({ value: (v as any).result } as any)
  const s = String(v).trim()
  if (s.includes('SEM')) return 'SEM'
  if (s.includes('NÃO') || s.includes('NAO')) return 'NAO_FOI'
  return s.length > 0 ? s : '---'
}

function tempoMin(cell: ExcelJS.Cell | undefined): number | null {
  if (!cell) return null
  const v = cell.value
  if (v == null) return null
  if (typeof v === 'number') {
    // Pode ser fração do dia
    if (v >= 0 && v < 1) return Math.round(v * 24 * 60)
    return Math.round(v)
  }
  if (v instanceof Date) {
    return v.getUTCHours() * 60 + v.getUTCMinutes()
  }
  if (typeof v === 'object' && 'result' in v) return tempoMin({ value: (v as any).result } as any)
  return null
}

interface Linha {
  loja: string
  mot1: string; placa1: string; sc1: string; chd1: string; sl1: string; tempo1: number | null
  mot2: string; placa2: string; sc2: string; chd2: string; sl2: string; tempo2: number | null
}

async function lerKpi(path: string): Promise<Linha[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  const ws = wb.worksheets[0]
  const out: Linha[] = []
  for (let r = 1; r <= 250; r++) {
    const row = ws.getRow(r)
    const loja = cvCell(row.getCell(1))
    if (!loja || loja === 'Loja' || loja.includes('LOJA')) continue
    // Pula header
    const placa1 = cvCell(row.getCell(4))
    const placa2 = cvCell(row.getCell(10))
    if (!placa1 && !placa2) continue
    out.push({
      loja,
      mot1: cvCell(row.getCell(2)),
      placa1: placa1,
      sc1: fmtTime(row.getCell(5)), chd1: fmtTime(row.getCell(6)), sl1: fmtTime(row.getCell(7)),
      tempo1: tempoMin(row.getCell(8)) ?? tempoMin(row.getCell(14)),
      mot2: cvCell(row.getCell(8)),
      placa2: placa2,
      sc2: fmtTime(row.getCell(11)), chd2: fmtTime(row.getCell(12)), sl2: fmtTime(row.getCell(13)),
      tempo2: tempoMin(row.getCell(14)),
    })
  }
  return out
}

;(async () => {
  console.log('Carregando manual...')
  const manual = await lerKpi('C:/Users/media/Downloads/KPI GUANABARA (1).xlsx')
  console.log(`Manual: ${manual.length} linhas`)
  console.log('Carregando gerado...')
  const gerado = await lerKpi('C:/Users/media/Downloads/KPI-GUANABARA-2026-05-19 (6).xlsx')
  console.log(`Gerado: ${gerado.length} linhas\n`)

  function normLoja(s: string): string {
    return s
      .toUpperCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\bGB\b/g, '')
      .replace(/\bFILIAL\b/g, '')
      .replace(/[^A-Z0-9]/g, '')
  }

  const manualByLoja = new Map(manual.map(l => [normLoja(l.loja), l]))
  const geradoByLoja = new Map(gerado.map(l => [normLoja(l.loja), l]))

  // Manual GUANABARA usa "SEM" + "RASTREADOR" em colunas separadas (texto
  // quebrado entre células). Trata como "SEM RASTREADOR" = sem dados de GPS.
  function isSemRastreador(sc: string, chd: string, sl: string): boolean {
    if (sc === 'SEM' && (chd === 'RASTREADOR' || chd === 'SEM')) return true
    if (sc.startsWith('SEM') && chd.startsWith('SEM') && sl.startsWith('SEM')) return true
    return false
  }
  function toMin(h: string): number | null {
    const m = /^(\d{1,2}):(\d{2})/.exec(h)
    return m ? Number(m[1]) * 60 + Number(m[2]) : null
  }
  // ±10 min de tolerância pra horários
  const TOLER_MIN = 10
  function timeEq(a: string, b: string): boolean {
    if (a === b) return true
    const ma = toMin(a), mb = toMin(b)
    if (ma == null || mb == null) return false
    return Math.abs(ma - mb) <= TOLER_MIN
  }

  let okExato = 0
  let okComTolerancia = 0
  let okSemRastreador = 0
  let diffSC = 0
  let diffCHD = 0
  let diffSL = 0
  let semGerado = 0
  let semManual = 0
  const detalhes: string[] = []

  // Lojas em ambos
  for (const [loja, m] of manualByLoja) {
    const g = geradoByLoja.get(loja)
    if (!g) {
      semGerado++
      detalhes.push(`❓ ${loja}: SÓ MANUAL`)
      continue
    }
    // Caso "sem rastreador" em ambos
    if (isSemRastreador(m.sc1, m.chd1, m.sl1) && isSemRastreador(g.sc1, g.chd1, g.sl1)) {
      okSemRastreador++
      continue
    }

    const sameSC = timeEq(m.sc1, g.sc1)
    const sameCHD = timeEq(m.chd1, g.chd1)
    const sameSL = timeEq(m.sl1, g.sl1)
    const exatos = m.sc1 === g.sc1 && m.chd1 === g.chd1 && m.sl1 === g.sl1

    if (sameSC && sameCHD && sameSL) {
      if (exatos) okExato++
      else { okComTolerancia++; detalhes.push(`⏱️ ${loja}: tolerância ±${TOLER_MIN}min  man=${m.sc1}/${m.chd1}/${m.sl1}  ger=${g.sc1}/${g.chd1}/${g.sl1}`) }
    } else {
      const diffs: string[] = []
      if (!sameSC) { diffSC++; diffs.push(`SC ${m.sc1}≠${g.sc1}`) }
      if (!sameCHD) { diffCHD++; diffs.push(`CHD ${m.chd1}≠${g.chd1}`) }
      if (!sameSL) { diffSL++; diffs.push(`SL ${m.sl1}≠${g.sl1}`) }

      // Categoriza
      const manSem = isSemRastreador(m.sc1, m.chd1, m.sl1)
      const gerSem = isSemRastreador(g.sc1, g.chd1, g.sl1)
      const manBlank = m.sc1 === '---' && m.chd1 === '---' && m.sl1 === '---'
      const gerBlank = g.sc1 === '---' && g.chd1 === '---' && g.sl1 === '---'
      let categoria = ''
      if (manSem && !gerSem && !gerBlank) categoria = '🔸 MANUAL=SEM RASTREADOR mas GERADO encontrou GPS'
      else if (!manSem && gerSem) categoria = '🔸 MANUAL com horário, GERADO=SEM rastreador'
      else if (!manSem && gerBlank) categoria = '🔸 MANUAL com horário, GERADO=--- (não encontrou)'
      else if (manSem && gerBlank) categoria = '🔸 MANUAL=SEM, GERADO=--- (ambos sem dado)'
      else {
        // Ambos com horários
        const mCHD = toMin(m.chd1); const gCHD = toMin(g.chd1)
        if (mCHD != null && gCHD != null && Math.abs(mCHD - gCHD) >= 60) categoria = '🔄 2 TURNOS (diff CHD ≥60min)'
        else categoria = '⏰ TIMING DIFERENTE'
      }
      detalhes.push(`❌ ${loja}  [${categoria}]\n     ${diffs.join(' | ')}\n     placas: man=${m.placa1} ger=${g.placa1}`)
    }
  }
  for (const [loja] of geradoByLoja) {
    if (!manualByLoja.has(loja)) {
      semManual++
      detalhes.push(`❓ ${loja}: SÓ GERADO`)
    }
  }

  console.log(`═══ RESUMO ═══`)
  console.log(`✅ OK exato: ${okExato}`)
  console.log(`⏱️ OK com tolerância ±${TOLER_MIN}min: ${okComTolerancia}`)
  console.log(`✅ OK ambos SEM RASTREADOR: ${okSemRastreador}`)
  console.log(`❌ Diferenças SC: ${diffSC}`)
  console.log(`❌ Diferenças CHD: ${diffCHD}`)
  console.log(`❌ Diferenças SL: ${diffSL}`)
  console.log(`❓ Só no manual: ${semGerado}`)
  console.log(`❓ Só no gerado: ${semManual}`)
  console.log(`Total lojas analisadas: ${manualByLoja.size} (manual) / ${geradoByLoja.size} (gerado)\n`)

  console.log(`═══ DETALHES ═══`)
  detalhes.forEach(d => console.log(d))
})().catch(e => { console.error(e); process.exit(1) })
