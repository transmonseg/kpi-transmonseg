import { readFile } from 'node:fs/promises'
import { parseEscalaGeral } from '../../src/lib/parsers/escala-geral.ts'
import { parseUnitrac } from '../../src/lib/parsers/unitrac.ts'

const g = await readFile('C:/Users/media/Downloads/dia 19/ESCALA GERAL DE MAIO 1 (6).xlsx')
const u = await readFile('C:/Users/media/Downloads/dia 19/relatorio_9521.xlsx')
const lin = await parseEscalaGeral(g.buffer.slice(g.byteOffset, g.byteOffset + g.byteLength), '2026-05-19')
const v = await parseUnitrac(u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength))

const placas = ['UBO5E01', 'CUC6J83', 'LFJ8442', 'AFY7J99']
for (const placa of placas) {
  console.log(`\n=== ${placa} ===`)
  const escalas = lin.filter(l => l.placa_norm === placa)
  console.log('Escalas:')
  for (const e of escalas) console.log(' ', e.rede_id, e.loja_nome_raw)

  const ve = v.find(x => x.placa_norm === placa)
  const fmtBRT = d => d ? `${String((d.getUTCHours()-3+24)%24).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}` : '—'
  console.log('Paradas LOJA:')
  for (const p of ve?.paradas.filter(x => x.classificacao === 'LOJA') ?? []) {
    console.log(`  ${fmtBRT(p.chegada)}-${fmtBRT(p.saida)} cod=${p.codigo_loja ?? '—'} ${p.nome_loja ?? p.local_parada}`)
  }
}
