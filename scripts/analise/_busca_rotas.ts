/**
 * Pra cada placa do manual ZONA_SUL dia 19, lista as paradas do Unitrac
 * destacando linhas onde local_parada tem apenas ROTA X (sem LOJA/BASE).
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFileSync } from 'fs'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'

// Placas do manual ZONA_SUL dia 19 com atribuições não-óbvias
const PLACAS = ['LJS2172', 'LCO0978', 'UBO5E05', 'KOP4978', 'LQU5546', 'KQR2J11', 'DBB8D19', 'BBH1C94', 'KMY5561']

async function main() {
  const v = await parseUnitracPdf(readFileSync('docs/conversas-tia-erica/dia-19/unitrac/relatorio_9572.pdf'), null)
  for (const placa of PLACAS) {
    const veic = v.find(x => x.placa_norm === placa)
    if (!veic) { console.log(`\n${placa}: não encontrado`); continue }
    console.log(`\n========= ${placa} (${veic.paradas.length} paradas) =========`)
    for (const p of veic.paradas) {
      const ts = `${p.chegada.toISOString().slice(11,16)}→${p.saida.toISOString().slice(11,16)}`
      const dur = Math.round(p.duracao_seg / 60)
      const local = (p.local_parada ?? '').slice(0, 100)
      // Destaca se tem ROTA mas não LOJA ou BASE
      const hasRota = /ROTA /.test(local)
      const hasBase = /BASE BENASSI/.test(local)
      const hasLoja = p.classificacao === 'LOJA'
      const marker = (hasRota && !hasBase && !hasLoja) ? '⚠️ ROTA-só' : ''
      console.log(`  ${ts} (${dur}min) [${p.classificacao}] ${marker} ${local}`)
    }
  }
}
main().catch(e => { console.error(e); process.exit(1) })
