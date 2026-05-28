/**
 * Detalhe RAW (local_parada completo) de placas onde manual atribui mas sistema vazio.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFileSync } from 'fs'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'

const PLACAS = ['LJS2B72', 'TJQ6J26', 'AMF0325', 'EYL8B91', 'NSM6D98', 'HNG2B61', 'KRB2J76']

async function main() {
  const v = await parseUnitracPdf(readFileSync('docs/conversas-tia-erica/dia-19/unitrac/relatorio_9572.pdf'), null)
  for (const placa of PLACAS) {
    const veic = v.find(x => x.placa_norm === placa)
    if (!veic) { console.log(`${placa}: NÃO ENCONTRADA`); continue }
    console.log(`\n======== ${placa} (${veic.paradas.length} paradas) ========`)
    for (const p of veic.paradas) {
      const ts = `${p.chegada.toISOString().slice(11,16)}→${p.saida.toISOString().slice(11,16)}`
      const dur = Math.round(p.duracao_seg / 60)
      const loc = (p.local_parada ?? '').replace(/\s+/g, ' ').slice(0, 120)
      console.log(`  ${ts} (${String(dur).padStart(3)}min) [${p.classificacao.padEnd(9)}] ${loc}`)
    }
  }
}
main().catch(e => { console.error(e); process.exit(1) })
