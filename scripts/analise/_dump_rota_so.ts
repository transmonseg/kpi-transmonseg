/**
 * Lista paradas onde local_parada tem APENAS ROTA X (sem LOJA específica nem BASE).
 * Pra entender o padrão das "ROTAs" que aparecem no Unitrac.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFileSync } from 'fs'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'

async function main() {
  const v = await parseUnitracPdf(readFileSync('docs/conversas-tia-erica/dia-19/unitrac/relatorio_9572.pdf'), null)
  console.log(`Total ${v.length} veículos\n`)
  let count = 0
  for (const veic of v) {
    const rotaSo = veic.paradas.filter(p => {
      const loc = (p.local_parada ?? '')
      const hasRota = /ROTA /.test(loc)
      const hasBase = /BASE BENASSI/.test(loc)
      const hasLoja = p.classificacao === 'LOJA'
      return hasRota && !hasBase && !hasLoja
    })
    if (rotaSo.length === 0) continue
    count++
    console.log(`\n${veic.placa_norm} (${rotaSo.length} paradas só-ROTA de ${veic.paradas.length} total):`)
    for (const p of rotaSo.slice(0, 6)) {
      const ts = `${p.chegada.toISOString().slice(11,16)}→${p.saida.toISOString().slice(11,16)}`
      const dur = Math.round(p.duracao_seg / 60)
      console.log(`  ${ts} (${dur}min) [${p.classificacao}] lat=${p.lat?.toFixed(4)} lng=${p.lng?.toFixed(4)}`)
      console.log(`    local: ${(p.local_parada ?? '').slice(0, 80)}`)
    }
  }
  console.log(`\n${count} veículos com paradas só-ROTA`)
}
main().catch(e => { console.error(e); process.exit(1) })
