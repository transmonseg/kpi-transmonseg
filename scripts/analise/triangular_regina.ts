// Triangular coords REGINA via paradas GPS REAIS em vários dias
// Sem Nominatim. Cruza dias 19, 20, 21 onde TML6D96 ou outras placas REGINA fizeram entrega.

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
const PLACAS_REGINA = new Set(['TML6D96', 'QSU6I54', 'UBO5E01'])

function fmt(d: any): string {
  if (!d) return '---'
  const dt = d instanceof Date ? d : new Date(d)
  return String(dt.getUTCHours()).padStart(2,'0') + ':' + String(dt.getUTCMinutes()).padStart(2,'0')
}

// Coordenadas no quadrante de Teresópolis (-22.35 a -22.50, -42.90 a -43.05)
function emTeresopolis(lat: number | null, lng: number | null): boolean {
  if (lat == null || lng == null) return false
  return lat >= -22.50 && lat <= -22.35 && lng >= -43.05 && lng <= -42.90
}

;(async () => {
  // Para cada dia, listar paradas em Teresópolis das placas REGINA
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
    console.log(`\n═══ DIA ${dia} ═══`)
    for (const placa of PLACAS_REGINA) {
      const v = veiculos.get(placa)
      if (!v) continue
      const paradasTeresopolis = v.paradas.filter((p: any) => emTeresopolis(p.lat, p.lng))
      if (paradasTeresopolis.length === 0) continue
      console.log(`\n${placa}:`)
      const sorted = [...paradasTeresopolis].sort((a, b) => +new Date(a.chegada) - +new Date(b.chegada))
      for (const p of sorted) {
        const dur = p.duracao_seg ? Math.round(p.duracao_seg/60) + 'min' : '?'
        console.log(`  [${p.classificacao.padEnd(10)}] ${fmt(p.chegada)}-${fmt(p.saida)} (${dur.padStart(6)})  ${p.lat.toFixed(5)},${p.lng.toFixed(5)}  cod=${(p.codigo_loja ?? '-').padEnd(10)} | ${(p.local_parada ?? '').slice(0,50)}`)
      }
    }
  }
})()
