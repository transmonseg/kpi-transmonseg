// Calibra a detecção de "relatório parcial": paradas reais da KOP-4978 no
// relatorio_10185 (corte 16:09) — rota Zona Sul Loja 01 Ipanema, chegou 16:15.
import { config } from 'dotenv'; config({ path: '.env.local' })
import { readFileSync } from 'node:fs'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { saidaBaseSeEmRota } from '@/lib/kpi/gerar-kpi-local'

async function main() {
  const vs = await parseUnitracPdf(readFileSync('C:/Users/media/Downloads/relatorio_10185.pdf'), new Set(['KOP4978']))
  // corte global do relatório
  let maxH = 0, maxISO = ''
  for (const v of vs) for (const p of v.paradas) for (const d of [p.chegada, p.saida]) {
    const h = d.getUTCHours() + d.getUTCMinutes() / 60
    if (h > maxH) { maxH = h; maxISO = d.toISOString().slice(11, 16) }
  }
  console.log(`Veículos: ${vs.length} | corte (maior horário): ${maxISO}`)
  const v = vs.find(v => v.placa_norm === 'KOP4978')
  if (!v) { console.log('KOP4978 não encontrada'); return }
  console.log(`\nKOP4978 — ${v.paradas.length} paradas:`)
  for (const p of v.paradas) {
    console.log(`  [${p.classificacao}] ${p.chegada.toISOString().slice(11,16)}→${p.saida.toISOString().slice(11,16)} dur=${Math.round((p.duracao_seg ?? 0)/60)}min cod=${p.codigo_loja ?? '—'} "${(p.nome_loja ?? '').slice(0,40)}" lat=${p.lat ?? '—'} lng=${p.lng ?? '—'}`)
  }
  const last = v.paradas[v.paradas.length - 1]
  if (last) {
    const gap = maxH - (last.saida.getUTCHours() + last.saida.getUTCMinutes() / 60)
    console.log(`\nÚltima parada: [${last.classificacao}] saída ${last.saida.toISOString().slice(11,16)} | gap até o corte: ${Math.round(gap*60)}min`)
  }
  // Verifica a detecção REAL de relatório parcial
  let corteMs = 0
  for (const vv of vs) for (const p of vv.paradas) corteMs = Math.max(corteMs, p.saida.getTime())
  const saida = saidaBaseSeEmRota(v.paradas, corteMs)
  console.log(`\n► DETECÇÃO relatório parcial: ${saida ? 'SIM — saída de base ' + saida.toISOString().slice(11,16) + ' (KPI mostra isso + "RELATÓRIO PARCIAL")' : 'NÃO'}`)
}
main().catch(e => { console.error(e); process.exit(1) })
