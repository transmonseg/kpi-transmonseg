/**
 * Dado lista de placas, lista TODAS as paradas LOJA + BASE BENASSI delas no Unitrac dia 19.
 * Útil pra "fazer KPI à mão" sem rodar matcher.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFileSync } from 'fs'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'

const PDF = 'docs/conversas-tia-erica/dia-19/unitrac/relatorio_9572.pdf'

async function main() {
  const placas = process.argv.slice(2).map(p => p.replace(/-/g, '').toUpperCase())
  if (!placas.length) { console.error('uso: tsx _paradas_por_placa.ts PLACA1 PLACA2 ...'); return }
  const buf = readFileSync(PDF)
  const veiculos = await parseUnitracPdf(buf, null)
  for (const placa of placas) {
    const v = veiculos.find(x => x.placa_norm === placa)
    console.log(`\n========== ${placa} ==========`)
    if (!v) { console.log('  (NÃO ENCONTRADA NO UNITRAC)'); continue }
    console.log(`  ${v.paradas.length} paradas`)
    for (const p of v.paradas) {
      const chd = new Date(p.chegada)
      const sai = new Date(p.saida)
      const dur = Math.round(p.duracao_seg / 60)
      const hh = (d: Date) => `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`
      const cls = p.classificacao.padEnd(8)
      const cod = (p.codigo_loja ?? '').padEnd(10)
      const nome = (p.nome_loja ?? p.local_parada ?? '').slice(0, 60)
      console.log(`  ${hh(chd)} → ${hh(sai)} (${String(dur).padStart(3)}min) [${cls}] ${cod} ${nome}`)
    }
  }
}
main().catch(e => { console.error(e); process.exit(1) })
