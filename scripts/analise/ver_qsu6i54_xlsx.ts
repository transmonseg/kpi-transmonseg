import { readFileSync } from 'fs'
import { parseUnitrac } from '@/lib/parsers/unitrac'

function fmt(d: any): string {
  if (!d) return '---'
  const dt = d instanceof Date ? d : new Date(d)
  return String(dt.getUTCHours()).padStart(2,'0') + ':' + String(dt.getUTCMinutes()).padStart(2,'0')
}

;(async () => {
  const v = await parseUnitrac(readFileSync('C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 21/relatorio_9552.xlsx'))
  const placas = ['QSU6I54', 'LSL9670', 'QST4C52', 'TML9I75', 'UBO0B68', 'LQE5E01']
  for (const placa of placas) {
    const vp = v.find(x => x.placa_norm === placa)
    console.log(`\n${placa}: ${vp?.paradas.length ?? 0} paradas no XLSX`)
    if (!vp) continue
    const sorted = [...vp.paradas].sort((a, b) => +new Date(a.chegada) - +new Date(b.chegada))
    for (const p of sorted) {
      const dur = p.duracao_seg ? Math.round(p.duracao_seg/60)+'min' : '?'
      console.log(`  [${p.classificacao.padEnd(10)}] ${fmt(p.chegada)}-${fmt(p.saida)} (${dur.padStart(6)})  cod=${(p.codigo_loja ?? '-').padEnd(10)} ${(p.nome_loja ?? p.local_parada ?? '').slice(0,55)}`)
    }
  }
})()
