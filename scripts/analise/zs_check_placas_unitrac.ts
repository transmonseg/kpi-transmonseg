import { readFileSync, readdirSync } from 'fs'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'

;(async () => {
  const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 19'
  const files = readdirSync(BASE)
  const xlsxFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))!
  const pdfFile = files.find(f => /relatorio.*\.pdf$/i.test(f))
  const xlsx = await parseUnitrac(readFileSync(BASE + '/' + xlsxFile))
  const pdf = pdfFile ? await parseUnitracPdf(readFileSync(BASE + '/' + pdfFile), new Set()).catch(() => []) : []
  const m = new Map<string, any>()
  for (const v of xlsx) m.set(v.placa_norm, v)
  for (const v of pdf) if (!m.has(v.placa_norm)) m.set(v.placa_norm, v)
  for (const p of ['LCO0978', 'LCO0J78', 'LJS2172', 'LQE5401', 'LTQ0783', 'LNU7733']) {
    const v = m.get(p)
    console.log(p, v ? `achado, ${v.paradas.length} paradas` : 'AUSENTE')
  }
  // Lista todas placas com prefixo LCO
  console.log('\nPlacas LCO* no Unitrac:')
  for (const k of m.keys()) {
    if (/^LCO/.test(k)) console.log('  ', k)
  }
})()
