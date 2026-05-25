/**
 * Compara KPI ARMAZÉM DO GRÃO manual × gerado pra cada dia disponível.
 * Mostra DIFFs com investigação no PDF Unitrac quando aplicável.
 */
import { readFileSync } from 'fs'
import { lerKpi, normLoja } from './_lib/ler-kpi'
import ExcelJS from 'exceljs'

function fmt(h: string): string { return h || '---' }

;(async () => {
  // Lista abas do manual
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile('C:/Users/media/Downloads/KPI ARMAZEM_GRAO.xlsx')
  console.log('Abas manual ARMAZEM:', wb.worksheets.map(w => w.name).join(', '))

  // Pra cada aba (dia), tenta achar o KPI gerado correspondente
  // O manual usa nome de aba "DD.MM" — extrai os dias disponíveis automaticamente
  const dias = wb.worksheets
    .map(w => w.name.match(/^(\d{1,2})\.\d{1,2}$/)?.[1] ?? w.name.match(/^(\d{1,2})$/)?.[1])
    .filter((d): d is string => !!d)
  console.log('Dias detectados no manual:', dias.join(', '))
  for (const dia of dias) {
    const aba = wb.worksheets.find(w => w.name === dia || w.name === `${dia}.05` || w.name === `${dia.padStart(2, '0')}.05`)
    if (!aba) { console.log(`\nDia ${dia}: sem aba no manual`); continue }

    const data = `2026-05-${dia.padStart(2, '0')}`
    // Tenta vários arquivos gerados
    let gerado: any[] = []
    const candidatos = [
      `C:/Users/media/Downloads/KPI-ARMAZEM_GRAO-${data}.xlsx`,
      `C:/Users/media/Downloads/KPI-ARMAZEM_GRAO-${data} (1).xlsx`,
      `C:/Users/media/Downloads/KPI-ARMAZEM_GRAO-${data} (2).xlsx`,
    ]
    let geradoFile = ''
    for (const path of candidatos) {
      try { gerado = await lerKpi(path); if (gerado.length) { geradoFile = path; break } } catch { /* ignore */ }
    }
    if (gerado.length === 0) { console.log(`\nDia ${dia}: sem KPI gerado encontrado`); continue }

    const manual = await lerKpi('C:/Users/media/Downloads/KPI ARMAZEM_GRAO.xlsx', dia)

    console.log(`\n══════════ DIA ${dia} (${data}) ══════════`)
    console.log(`  Manual: ${manual.length} linhas  |  Gerado: ${gerado.length} linhas  (${geradoFile.split('/').pop()})`)

    const manualByLoja = new Map(manual.map(l => [normLoja(l.loja), l]))
    const geradoByLoja = new Map(gerado.map(l => [normLoja(l.loja), l]))

    let okExato = 0
    let okTolerancia = 0
    let semGerado = 0
    let semManual = 0
    const diffs: Array<{loja:string, m: any, g: any}> = []

    function toMin(h: string): number | null {
      const m = /^(\d{1,2}):(\d{2})/.exec(h)
      return m ? +m[1]*60 + +m[2] : null
    }
    function eq(a: string, b: string, tol = 0): boolean {
      if (a === b) return true
      const ma = toMin(a), mb = toMin(b)
      if (ma == null || mb == null) return false
      return Math.abs(ma - mb) <= tol
    }
    function semDados(l: any): boolean {
      return (l.sc1 === '---' || l.sc1.startsWith('SEM')) &&
             (l.chd1 === '---' || l.chd1.startsWith('SEM') || l.chd1 === 'RASTREADOR') &&
             (l.sl1 === '---' || l.sl1.startsWith('SEM') || l.sl1 === '')
    }

    for (const [key, m] of manualByLoja) {
      const g = geradoByLoja.get(key)
      if (!g) { semGerado++; continue }
      if (semDados(m) && semDados(g)) { okExato++; continue }
      if (eq(m.sc1, g.sc1) && eq(m.chd1, g.chd1) && eq(m.sl1, g.sl1)) { okExato++; continue }
      if (eq(m.sc1, g.sc1, 10) && eq(m.chd1, g.chd1, 10) && eq(m.sl1, g.sl1, 10)) { okTolerancia++; continue }
      diffs.push({ loja: m.loja, m, g })
    }
    for (const [k] of geradoByLoja) if (!manualByLoja.has(k)) semManual++

    console.log(`  ✅ OK: ${okExato} | ⏱️ tol±10: ${okTolerancia} | ❌ DIFF: ${diffs.length} | só manual: ${semGerado} | só gerado: ${semManual}`)

    for (const { loja, m, g } of diffs) {
      console.log(`    ❌ ${loja.slice(0, 35).padEnd(35)} man=${fmt(m.sc1)}/${fmt(m.chd1)}/${fmt(m.sl1)}  ger=${fmt(g.sc1)}/${fmt(g.chd1)}/${fmt(g.sl1)}  placas: m=${m.placa1} g=${g.placa1}`)
    }
  }
})()
