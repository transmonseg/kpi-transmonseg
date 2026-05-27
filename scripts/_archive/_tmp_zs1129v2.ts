import { readFileSync, readdirSync } from 'fs'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { variantesOcr } from '@/lib/kpi/matcher'
import { config } from 'dotenv'
config({ path: '.env.local' })

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA'

function fmtT(d: Date | string | null): string {
  if (!d) return '---'
  const dt = d instanceof Date ? d : new Date(d)
  return `${String(dt.getUTCHours()).padStart(2,'0')}:${String(dt.getUTCMinutes()).padStart(2,'0')}`
}

;(async () => {
  for (const dia of ['19', '20']) {
    console.log(`\n═══ DIA ${dia} ═══`)
    const pasta = `${BASE}/ESCALA DIA ${dia}`
    const files = readdirSync(pasta)
    const xlsxFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))
    const pdfFile = files.find(f => /relatorio.*\.pdf$/i.test(f))
    let veiculos: any[] = []
    if (xlsxFile) veiculos.push(...await parseUnitrac(readFileSync(`${pasta}/${xlsxFile}`)))
    if (pdfFile) veiculos.push(...await parseUnitracPdf(readFileSync(`${pasta}/${pdfFile}`), new Set()).catch(() => []))

    const placasAlvo = ['KYM2I62', 'MDV3746']
    for (const placa of placasAlvo) {
      const variantes = variantesOcr(placa)
      console.log(`\n  Placa ${placa} (variantes: ${variantes.join(', ')}):`)
      for (const variant of variantes) {
        const v = veiculos.find(v => v.placa_norm === variant)
        if (!v) continue
        console.log(`    Variant ${variant} (${v.paradas.length} paradas):`)
        for (const p of v.paradas) {
          if (p.classificacao === 'BASE' || p.classificacao === 'FAKE_EXIT') continue
          console.log(`      ${fmtT(p.chegada)} → ${fmtT(p.saida)}  ${p.classificacao.padEnd(10)}  ${p.local_parada?.slice(0,55)}`)
        }
      }
    }
  }
})()
