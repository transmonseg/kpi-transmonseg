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
  let veiculos: any[] = []
  if (xlsxFile) veiculos.push(...await parseUnitrac(readFileSync(`${pasta}/${xlsxFile}`)))

  // Acha placas com paradas entre 12:30-14:00 ou local_parada com OLARIA
  console.log('Paradas LOJA entre 12:30-14:00 OU com OLARIA:')
  for (const v of veiculos) {
    for (const p of v.paradas) {
      if (p.classificacao !== 'LOJA') continue
      const h = new Date(p.chegada).getUTCHours()
      const m = new Date(p.chegada).getUTCMinutes()
      const inWindow = (h === 12 && m >= 30) || (h === 13) || (h === 14 && m === 0)
      const hasOlaria = /OLARIA/i.test(p.local_parada || '') || /1129/.test(p.local_parada || '')
      if (!inWindow && !hasOlaria) continue
      console.log(`  ${v.placa_norm}  ${fmtT(p.chegada)} → ${fmtT(p.saida)}  ${p.local_parada?.slice(0,60)}`)
    }
  }
})()
