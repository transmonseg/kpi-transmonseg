// Triangular coords ARMAZEM Petrópolis (BOA VISTA, POSSE, 16 MARÇO, CAPELA)
// via manual + GPS de múltiplos dias

import { readFileSync, readdirSync, existsSync } from 'fs'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'

const PASTAS = [
  'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 18',
  'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 19',
  'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 20',
  'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 21',
  'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 22',
]

// Placas conhecidas que fazem ARMAZEM Petrópolis
const PLACAS_PETROPOLIS = new Set(['TML9I75','UDC6I03','LSL9670','QST4C52','LQE5E01','UBO5E01','QSU6I54','TML6D96'])

function fmt(d: any): string {
  if (!d) return '---'
  const dt = d instanceof Date ? d : new Date(d)
  return String(dt.getUTCHours()).padStart(2,'0') + ':' + String(dt.getUTCMinutes()).padStart(2,'0')
}

// Petrópolis: lat -22.45 a -22.55, lng -43.10 a -43.25
function emPetropolis(lat: number | null, lng: number | null): boolean {
  if (lat == null || lng == null) return false
  return lat >= -22.55 && lat <= -22.45 && lng >= -43.25 && lng <= -43.10
}

;(async () => {
  for (const pasta of PASTAS) {
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

    const dia = pasta.match(/DIA (\d+)/)?.[1] ?? '?'
    console.log(`\n═══ DIA ${dia} — placas ARMAZEM em Petrópolis ═══`)
    for (const placa of PLACAS_PETROPOLIS) {
      const v = veiculos.get(placa)
      if (!v) continue
      const paradas = v.paradas.filter((p: any) => emPetropolis(p.lat, p.lng))
      if (paradas.length === 0) continue
      console.log(`\n${placa}:`)
      const sorted = [...paradas].sort((a, b) => +new Date(a.chegada) - +new Date(b.chegada))
      for (const p of sorted) {
        const dur = p.duracao_seg ? Math.round(p.duracao_seg/60) + 'min' : '?'
        console.log(`  [${p.classificacao.padEnd(10)}] ${fmt(p.chegada)}-${fmt(p.saida)} (${dur.padStart(6)})  ${p.lat.toFixed(5)},${p.lng.toFixed(5)}  cod=${(p.codigo_loja ?? '-').padEnd(10)} | ${(p.local_parada ?? '').slice(0,55)}`)
      }
    }
  }
})()
