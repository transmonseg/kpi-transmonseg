import { readFileSync } from 'fs'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'

;(async () => {
  const veiculos = await parseUnitracPdf(
    readFileSync('C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 18/relatorio_9401.pdf'),
    new Set()
  )
  const v = veiculos.find(x => x.placa_norm === 'LKW2B80')
  if (!v) { console.log('Não achei'); return }
  console.log(`LKW2B80: ${v.paradas.length} paradas`)
  function f(d: Date | null | undefined) {
    if (!d) return '---'
    return String(d.getUTCHours()).padStart(2,'0') + ':' + String(d.getUTCMinutes()).padStart(2,'0')
  }
  for (const p of [...v.paradas].sort((a, b) => +new Date(a.chegada) - +new Date(b.chegada))) {
    console.log(`  [${p.classificacao.padEnd(10)}] ${f(p.chegada)}-${f(p.saida)} cod=${p.codigo_loja ?? '-'} | local="${p.local_parada.slice(0,80)}"`)
  }
})()
