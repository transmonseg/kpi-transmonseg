import { readFileSync } from 'fs'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 19'

function fmt(d: any): string {
  if (!d) return '---'
  const dt = d instanceof Date ? d : new Date(d)
  return String(dt.getUTCHours()).padStart(2,'0') + ':' + String(dt.getUTCMinutes()).padStart(2,'0')
}
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3
  const toRad = (x:number) => x * Math.PI / 180
  const dLat = toRad(lat2-lat1); const dLon = toRad(lon2-lon1)
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2
  return 2 * R * Math.asin(Math.sqrt(a))
}

const POSSE = { lat: -22.2523, lng: -43.0738 }

;(async () => {
  const xlsx = await parseUnitrac(readFileSync(BASE + '/relatorio_9391.xlsx'))
  const pdf = await parseUnitracPdf(readFileSync(BASE + '/relatorio_9572.pdf'), new Set()).catch(() => [])
  const veiculos = new Map<string, any>()
  for (const v of xlsx) veiculos.set(v.placa_norm, v)
  for (const v of pdf) if (!veiculos.has(v.placa_norm)) veiculos.set(v.placa_norm, v)

  console.log(`Paradas a < 2km de MATRIZ POSSE (${POSSE.lat},${POSSE.lng}) dia 19:`)
  for (const [placa, v] of veiculos) {
    for (const p of v.paradas) {
      if (p.lat == null || p.lng == null) continue
      const d = haversine(POSSE.lat, POSSE.lng, p.lat, p.lng)
      if (d > 2000) continue
      console.log(`  ${placa.padEnd(10)} [${p.classificacao.padEnd(10)}] ${fmt(p.chegada)}-${fmt(p.saida)} (${Math.round(d)}m) cod=${p.codigo_loja ?? '-'} | ${(p.local_parada ?? '').slice(0,55)}`)
    }
  }
})()
