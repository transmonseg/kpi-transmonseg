import { readFileSync } from 'fs'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 19'

function fmt(d: any): string {
  if (!d) return '---'
  const dt = d instanceof Date ? d : new Date(d)
  return String(dt.getUTCHours()).padStart(2,'0') + ':' + String(dt.getUTCMinutes()).padStart(2,'0')
}

;(async () => {
  const xlsx = await parseUnitrac(readFileSync(BASE + '/relatorio_9391.xlsx'))
  const pdf = await parseUnitracPdf(readFileSync(BASE + '/relatorio_9572.pdf'), new Set()).catch(() => [])
  const veiculos = new Map<string, any>()
  for (const v of xlsx) veiculos.set(v.placa_norm, v)
  for (const v of pdf) if (!veiculos.has(v.placa_norm)) veiculos.set(v.placa_norm, v)

  // Paradas LOJA entre 10:30 e 11:30 (alvo: descobrir quem fez 11:06)
  console.log('Paradas LOJA 10:30-11:30 dia 19:')
  for (const [placa, v] of veiculos) {
    for (const p of v.paradas) {
      if (p.classificacao !== 'LOJA') continue
      const h = new Date(p.chegada).getUTCHours()
      const m = new Date(p.chegada).getUTCMinutes()
      const min = h * 60 + m
      if (min < 10*60+30 || min > 11*60+30) continue
      console.log(`  ${placa.padEnd(10)} [${p.classificacao}] ${fmt(p.chegada)}-${fmt(p.saida)} cod=${p.codigo_loja ?? '-'} lat=${p.lat ?? '?'} lng=${p.lng ?? '?'} | ${(p.local_parada ?? '').slice(0,60)}`)
    }
  }
})()
