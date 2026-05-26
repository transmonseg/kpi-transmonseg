import { readFileSync } from 'fs'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'

;(async () => {
  const buf = readFileSync('C:/Users/media/Downloads/relatorio_9612.pdf')
  const veiculos = await parseUnitracPdf(buf, new Set())
  console.log(`Total veículos no PDF: ${veiculos.length}`)

  const placa = 'LCE4337'
  const v = veiculos.find(x => x.placa_norm === placa)
  if (!v) {
    console.log(`❌ ${placa} NÃO ESTÁ no Unitrac PDF`)
    return
  }
  console.log(`\n✓ ${placa} no Unitrac PDF — ${v.paradas.length} paradas:\n`)
  const sorted = [...v.paradas].sort((a, b) => +new Date(a.chegada) - +new Date(b.chegada))
  function f(d: Date | null | undefined) {
    if (!d) return '---'
    return String(d.getUTCHours()).padStart(2,'0') + ':' + String(d.getUTCMinutes()).padStart(2,'0')
  }
  for (const p of sorted) {
    const dur = p.duracao_seg ? Math.round(p.duracao_seg / 60) + 'min' : '?'
    const nome = (p.nome_loja ?? p.local_parada ?? '').slice(0, 80)
    const cod = p.codigo_loja ?? '-'
    console.log(`  [${p.classificacao.padEnd(10)}] ${f(p.chegada)}-${f(p.saida ?? p.chegada)} ${dur.padStart(7)} cod:${String(cod).padEnd(10)} ${nome}`)
  }
})()
