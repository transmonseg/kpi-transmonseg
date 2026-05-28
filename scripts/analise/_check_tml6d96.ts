import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFileSync } from 'fs'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'

async function main() {
  const v = (await parseUnitracPdf(readFileSync('docs/conversas-tia-erica/dia-19/unitrac/relatorio_9572.pdf'), null))
    .find(x => x.placa_norm === 'TML6D96')
  if (!v) return
  // Cadastros REGINA
  const lojas = [
    { nome: 'BARRA IMBUY', lat: -22.4004, lng: -42.979 },
    { nome: '1 DE MAIO', lat: -22.4168, lng: -42.9698 },
    { nome: 'LUCIO MEIRA', lat: -22.4133, lng: -42.9705 },
    { nome: 'ABASTECEDORA SERRA', lat: -22.4386, lng: -42.9796 },
    { nome: 'BOA VISTA', lat: -22.3524, lng: -43.1202 },
    { nome: 'MATRIZ POSSE', lat: -22.2523, lng: -43.0738 },
  ]
  const hav = (a: number, b: number, c: number, d: number) => {
    const R = 6371000
    const φ1 = a * Math.PI / 180, φ2 = c * Math.PI / 180
    const Δφ = (c - a) * Math.PI / 180, Δλ = (d - b) * Math.PI / 180
    const x = Math.sin(Δφ/2)**2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2)**2
    return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1-x))
  }
  console.log('TML6D96 paradas LOJA — distâncias das 6 lojas REGINA:\n')
  for (const p of v.paradas.filter(p => p.classificacao === 'LOJA')) {
    const ts = `${p.chegada.toISOString().slice(11,16)}→${p.saida.toISOString().slice(11,16)}`
    const dists = lojas.map(l => ({ nome: l.nome, d: Math.round(hav(p.lat!, p.lng!, l.lat, l.lng)) }))
    dists.sort((a, b) => a.d - b.d)
    const top = dists[0]
    console.log(`  ${ts}  cod=${p.codigo_loja} lat=${p.lat?.toFixed(4)} lng=${p.lng?.toFixed(4)}  mais próxima: ${top.nome} ${top.d}m`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
