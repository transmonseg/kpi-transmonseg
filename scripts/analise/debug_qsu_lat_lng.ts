import { readFileSync } from 'fs'
import { parseUnitrac } from '@/lib/parsers/unitrac'

function fmt(d: any): string {
  if (!d) return '---'
  const dt = d instanceof Date ? d : new Date(d)
  return String(dt.getUTCHours()).padStart(2,'0') + ':' + String(dt.getUTCMinutes()).padStart(2,'0')
}

;(async () => {
  const v = await parseUnitrac(readFileSync('C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 21/relatorio_9552.xlsx'))
  const placa = 'QSU6I54'
  const vp = v.find(x => x.placa_norm === placa)!
  console.log(`${placa} XLSX — ${vp.paradas.length} paradas:\n`)
  for (const p of vp.paradas) {
    console.log(`  [${p.classificacao.padEnd(10)}] ${fmt(p.chegada)}-${fmt(p.saida)}  lat=${p.lat ?? '-'}  lng=${p.lng ?? '-'}  | ${(p.local_parada ?? '').slice(0,50)}`)
  }
})()
