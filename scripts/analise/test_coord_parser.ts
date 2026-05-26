/**
 * Compara o parser PDF antigo (regex) vs novo (coordenadas) no dia 19.
 */
import { readFileSync } from 'fs'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { parseUnitracPdfRobust } from '@/lib/parsers/unitrac-pdf-coord'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 19'

function fmt(d: Date | null | undefined): string {
  if (!d) return '---'
  return String(d.getUTCHours()).padStart(2,'0') + ':' + String(d.getUTCMinutes()).padStart(2,'0')
}

;(async () => {
  const buf = readFileSync(BASE + '/relatorio_9572.pdf')

  console.log('Parser antigo (regex)...')
  const t0 = Date.now()
  const old = await parseUnitracPdf(buf, new Set())
  console.log(`  ${old.length} veículos em ${Date.now() - t0}ms`)

  console.log('Parser novo (coordenadas)...')
  const t1 = Date.now()
  const novo = await parseUnitracPdfRobust(buf, new Set())
  console.log(`  ${novo.length} veículos em ${Date.now() - t1}ms`)

  // Comparar uma placa específica (LQU5546)
  const placa = 'LQU5546'
  const oldV = old.find(v => v.placa_norm === placa)
  const novoV = novo.find(v => v.placa_norm === placa)
  console.log(`\n═══ ${placa} ═══`)
  console.log(`Antigo: ${oldV?.paradas.length ?? 0} paradas`)
  console.log(`Novo:   ${novoV?.paradas.length ?? 0} paradas`)
  if (oldV) {
    console.log('\n--- Antigo ---')
    for (const p of [...oldV.paradas].sort((a,b)=>+new Date(a.chegada)-+new Date(b.chegada))) {
      console.log(`  [${p.classificacao.padEnd(10)}] ${fmt(p.chegada)}-${fmt(p.saida)} cod=${p.codigo_loja ?? '-'} | ${(p.nome_loja ?? p.local_parada ?? '').slice(0,60)}`)
    }
  }
  if (novoV) {
    console.log('\n--- Novo ---')
    for (const p of [...novoV.paradas].sort((a,b)=>+new Date(a.chegada)-+new Date(b.chegada))) {
      console.log(`  [${p.classificacao.padEnd(10)}] ${fmt(p.chegada)}-${fmt(p.saida)} cod=${p.codigo_loja ?? '-'} | ${(p.nome_loja ?? p.local_parada ?? '').slice(0,60)}`)
    }
  }
})()
