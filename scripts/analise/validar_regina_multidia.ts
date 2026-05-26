// Para cada dia, cruzar manual (KPI ARMAZEM) com GPS da placa GILSON
// e identificar amarração correta de REGINA/ABASTECEDORA

import { readFileSync, readdirSync, existsSync } from 'fs'
import * as XLSX from 'xlsx'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'

const MANUAL = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 20/KPIS MANUAIS/KPI ARMAZEM DO GRAO.xlsx'
const PASTAS_BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA'

function fmt(d: any): string {
  if (!d) return '---'
  const dt = d instanceof Date ? d : new Date(d)
  return String(dt.getUTCHours()).padStart(2,'0') + ':' + String(dt.getUTCMinutes()).padStart(2,'0')
}

function emTeresopolis(lat: number | null, lng: number | null): boolean {
  if (lat == null || lng == null) return false
  return lat >= -22.50 && lat <= -22.35 && lng >= -43.05 && lng <= -42.90
}

;(async () => {
  const wb = XLSX.read(readFileSync(MANUAL), { type: 'buffer' })

  // Para cada aba (cada dia), extrai linhas REGINA + ABASTECEDORA
  for (const aba of wb.SheetNames) {
    if (!/^\d{2}$/.test(aba)) continue
    const ws = wb.Sheets[aba]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as any[][]
    const reginaLines: { loja: string; mot: string; placa: string; sc: string; chd: string; sl: string }[] = []
    for (const r of rows) {
      if (!r || r.length < 8) continue
      const loja = String(r[0] ?? '')
      if (!/REGINA|ABASTECEDORA|ABASTEC|ALTO|MAIO|LUCIO|BARRA  IMBUY|BARRA DO IMBUY/i.test(loja)) continue
      reginaLines.push({
        loja: loja.trim(),
        mot: String(r[1] ?? '').trim(),
        placa: String(r[3] ?? '').replace(/[^A-Z0-9]/gi, ''),
        sc: String(r[4] ?? '').trim(),
        chd: String(r[5] ?? '').trim(),
        sl: String(r[6] ?? '').trim(),
      })
    }
    if (reginaLines.length === 0) continue

    const dia = parseInt(aba, 10)
    const pasta = `${PASTAS_BASE}/ESCALA DIA ${dia.toString().padStart(2,'0')}`
    if (!existsSync(pasta)) continue
    const files = readdirSync(pasta)
    const xlsxFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))
    const pdfFile = files.find(f => /relatorio.*\.pdf$/i.test(f))
    if (!xlsxFile) continue

    const xlsx = await parseUnitrac(readFileSync(pasta + '/' + xlsxFile))
    const pdf = pdfFile ? await parseUnitracPdf(readFileSync(pasta + '/' + pdfFile), new Set()).catch(() => []) : []
    const veiculos = new Map<string, any>()
    for (const v of xlsx) veiculos.set(v.placa_norm, v)
    for (const v of pdf) if (!veiculos.has(v.placa_norm)) veiculos.set(v.placa_norm, v)

    // Placas únicas pra REGINA dia
    const placasReg = new Set(reginaLines.map(l => l.placa).filter(Boolean))
    console.log(`\n═══ DIA ${aba} ═══`)
    console.log('Manual:')
    for (const l of reginaLines) {
      console.log(`  ${l.loja.padEnd(45)} ${l.mot.padEnd(10)} ${l.placa.padEnd(8)} SC=${l.sc} CHD=${l.chd} SL=${l.sl}`)
    }
    for (const placa of placasReg) {
      const v = veiculos.get(placa)
      if (!v) { console.log(`  GPS ${placa}: ausente`); continue }
      const tres = v.paradas.filter((p: any) => emTeresopolis(p.lat, p.lng)).sort((a:any,b:any) => +new Date(a.chegada) - +new Date(b.chegada))
      if (tres.length === 0) { console.log(`  GPS ${placa}: sem paradas Teresópolis`); continue }
      console.log(`  GPS ${placa} (${tres.length} paradas Teresópolis):`)
      for (const p of tres) {
        const dur = p.duracao_seg ? Math.round(p.duracao_seg/60) + 'min' : '?'
        console.log(`    [${p.classificacao.padEnd(10)}] ${fmt(p.chegada)}-${fmt(p.saida)} (${dur.padStart(6)})  ${p.lat.toFixed(5)},${p.lng.toFixed(5)}`)
      }
    }
  }
})()
