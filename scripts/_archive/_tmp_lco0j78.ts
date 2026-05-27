import { readFileSync, readdirSync } from 'fs'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { config } from 'dotenv'
config({ path: '.env.local' })

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA'

function fmtT(d: Date | string | null): string {
  if (!d) return '---'
  const dt = d instanceof Date ? d : new Date(d)
  return `${String(dt.getUTCHours()).padStart(2,'0')}:${String(dt.getUTCMinutes()).padStart(2,'0')}`
}

;(async () => {
  const pasta = `${BASE}/ESCALA DIA 20`
  const files = readdirSync(pasta)
  const xlsxFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))
  const pdfFile = files.find(f => /relatorio.*\.pdf$/i.test(f))
  let veiculos: any[] = []
  if (xlsxFile) veiculos.push(...await parseUnitrac(readFileSync(`${pasta}/${xlsxFile}`)))
  if (pdfFile) veiculos.push(...await parseUnitracPdf(readFileSync(`${pasta}/${pdfFile}`), new Set()).catch(() => []))

  for (const p of ['LCO0J78', 'LJS2B72', 'LJS2I72', 'EFU5H04']) {
    const v = veiculos.find(v => v.placa_norm === p)
    if (!v) { console.log(`${p}: AUSENTE`); continue }
    console.log(`\n═══ ${p} dia 20 ═══`)
    for (const par of v.paradas) {
      if (par.classificacao === 'BASE' || par.classificacao === 'FAKE_EXIT') continue
      console.log(`  ${fmtT(par.chegada)} → ${fmtT(par.saida)}  ${par.classificacao.padEnd(10)}  ${par.local_parada?.slice(0,60)}`)
    }
  }
})()
