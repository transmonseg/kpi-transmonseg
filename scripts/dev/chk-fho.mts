import { readFile } from 'fs/promises'
import { config } from 'dotenv'; config({ path: '.env.local' })
import { parseUnitracPdf } from '../../src/lib/parsers/unitrac-pdf.ts'
import { saidaBaseSeEmRota } from '../../src/lib/kpi/gerar-kpi-local.ts'

const hhmm = (d: Date | null) => d ? `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}` : '—'
for (const [nome, path] of [['MANHÃ (10351)', 'C:/Users/media/Downloads/relatorio_10351 (1).pdf'], ['TARDE (10397)', 'C:/Users/media/Downloads/relatorio_10397.pdf']]) {
  const veic = await parseUnitracPdf(await readFile(path), new Set(['FHO5F88']))
  // janela do relatório
  let mx = 0; for (const v of veic) for (const p of v.paradas) { const t = new Date(p.saida ?? p.chegada); mx = Math.max(mx, t.getUTCHours()+t.getUTCMinutes()/60) }
  const fho = veic.find(v => v.placa_norm === 'FHO5F88')
  console.log(`\n===== ${nome} · relatório vai até ~${mx.toFixed(1)}h =====`)
  if (!fho) { console.log('  FHO5F88 NÃO está no relatório'); continue }
  const paradas = fho.paradas.map(p => ({ classificacao: p.classificacao, chegada: new Date(p.chegada), saida: p.saida ? new Date(p.saida) : null }))
  for (const p of [...paradas].sort((a,b)=>a.chegada.getTime()-b.chegada.getTime())) console.log(`  [${p.classificacao.padEnd(9)}] ${hhmm(p.chegada)}→${hhmm(p.saida)}`)
  const corteMs = paradas.reduce((mx,p)=>Math.max(mx,(p.saida??p.chegada).getTime()),0)
  console.log(`  >>> saidaBaseSeEmRota (NOVO) = ${hhmm(saidaBaseSeEmRota(paradas, corteMs))}`)
}
