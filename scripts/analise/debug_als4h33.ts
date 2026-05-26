import { readFileSync } from 'fs'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>

;(async () => {
  const buf = readFileSync('C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 18/relatorio_9401.pdf')
  const r = await pdfParse(buf)
  const idx = r.text.indexOf('ALS-4H33')
  const next = r.text.indexOf('Veículo', idx + 200)
  console.log('═══ TEXT RAW ALS-4H33 ═══')
  console.log(r.text.slice(idx, next))

  console.log('\n═══ PARSED ═══')
  const veiculos = await parseUnitracPdf(buf, new Set())
  const v = veiculos.find(x => x.placa_norm === 'ALS4H33')!
  function f(d: Date | null | undefined) {
    if (!d) return '---'
    return String(d.getUTCHours()).padStart(2,'0') + ':' + String(d.getUTCMinutes()).padStart(2,'0')
  }
  for (const p of [...v.paradas].sort((a, b) => +new Date(a.chegada) - +new Date(b.chegada))) {
    console.log(`  [${p.classificacao.padEnd(10)}] ${f(p.chegada)}-${f(p.saida)} cod=${p.codigo_loja ?? '-'} | local="${p.local_parada.slice(0,80)}"`)
  }
})()
