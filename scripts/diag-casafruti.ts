import { readFileSync } from 'node:fs'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { parseEscalaArquivo } from '@/lib/parsers/escala-arquivo'
const DL = 'C:/Users/media/Downloads'
async function main() {
  const vs = await parseUnitracPdf(readFileSync(`${DL}/relatorio_10122.pdf`), new Set())
  const placas = new Map<string, { lat: number|null; lng: number|null; vezes: number }>()
  for (const v of vs) for (const p of v.paradas) if (p.codigo_loja === '26603000') {
    const e = placas.get(v.placa_norm) ?? { lat: p.lat, lng: p.lng, vezes: 0 }
    e.vezes++; if (p.lat) { e.lat = p.lat; e.lng = p.lng }; placas.set(v.placa_norm, e)
  }
  console.log('Placas que entregaram CASAFRUTI (26603000):')
  for (const [pl, x] of placas) console.log(`  ${pl}  ${x.vezes}x  coord=${x.lat},${x.lng}`)
  // procura essas placas na escala do dia 8 pra achar a rede
  let esc: any[] = []
  for (const f of ['ESCALA 08.06.pdf', 'ESCALA ZONA SUL - JUNHO (2).xlsx']) {
    try { esc = esc.concat(await parseEscalaArquivo(readFileSync(`${DL}/${f}`), f, '2026-06-08')) } catch {}
  }
  console.log('\nNa escala do dia 8, essas placas aparecem como:')
  for (const pl of placas.keys()) {
    const linhas = esc.filter(l => l.placa_norm === pl)
    if (!linhas.length) console.log(`  ${pl}: não está na escala`)
    for (const l of linhas) console.log(`  ${pl}: rede=${l.rede_id} loja="${l.loja_nome_raw}" cod="${l.loja_codigo_raw}"`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
