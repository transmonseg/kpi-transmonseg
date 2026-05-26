import { readFileSync, readdirSync } from 'fs'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 20'

function fmt(d: any): string {
  if (!d) return '---'
  const dt = d instanceof Date ? d : new Date(d)
  return String(dt.getUTCHours()).padStart(2,'0') + ':' + String(dt.getUTCMinutes()).padStart(2,'0')
}

;(async () => {
  const files = readdirSync(BASE)
  console.log('Arquivos:', files)
  const xlsxFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))!
  const pdfFile = files.find(f => /relatorio.*\.pdf$/i.test(f))

  const xlsx = await parseUnitrac(readFileSync(BASE + '/' + xlsxFile))
  const pdf = pdfFile ? await parseUnitracPdf(readFileSync(BASE + '/' + pdfFile), new Set()).catch(() => []) : []
  const veiculos = new Map<string, any>()
  for (const v of xlsx) veiculos.set(v.placa_norm, v)
  for (const v of pdf) if (!veiculos.has(v.placa_norm)) veiculos.set(v.placa_norm, v)

  const v = veiculos.get('QSZ9A20')
  if (!v) { console.log('QSZ9A20 ausente'); return }
  console.log(`\nQSZ9A20 — ${v.paradas.length} paradas:`)
  for (const p of [...v.paradas].sort((a, b) => +new Date(a.chegada) - +new Date(b.chegada))) {
    const dur = p.duracao_seg ? Math.round(p.duracao_seg/60) + 'min' : '?'
    console.log(`  [${p.classificacao.padEnd(10)}] ${fmt(p.chegada)}-${fmt(p.saida)} (${dur.padStart(6)})  ${(p.lat ?? 0).toFixed(5)},${(p.lng ?? 0).toFixed(5)}  cod=${(p.codigo_loja ?? '-').padEnd(10)} | ${(p.local_parada ?? '').slice(0,55)}`)
  }
})()
