import { config } from 'dotenv'; config({ path: '.env.local' })
import { readFileSync } from 'node:fs'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { variantesMercosul, variantesPlaca } from '@/lib/kpi/matcher'
async function main() {
  console.log('variantesMercosul(LCO0978) =', variantesMercosul('LCO0978'))
  console.log('variantesPlaca(LCO0978) =', variantesPlaca('LCO0978'))
  console.log('variantesMercosul(KNI8942) =', variantesMercosul('KNI8942'))
  // Parseia COM cadastro tendo a placa antiga LCO0978 (como faz o pipeline real)
  const cad = new Set(['LCO0978','KNI8942'])
  const vs = await parseUnitracPdf(readFileSync('C:/Users/media/Downloads/relatorio_10122.pdf'), cad)
  for (const alvo of ['LCO0J78','LCO0978','KNI8942']) {
    const v = vs.find(v => v.placa_norm === alvo)
    console.log(`\n=== ${alvo} no relatório: ${v ? v.paradas.length+' paradas' : 'NÃO ACHOU'} ===`)
    if (v) for (const p of v.paradas) console.log(`   [${p.classificacao}] cod=${p.codigo_loja ?? '—'} "${p.nome_loja ?? '—'}" ${p.chegada.toISOString().slice(11,16)}`)
  }
}
main().catch(e=>{console.error(e);process.exit(1)})
