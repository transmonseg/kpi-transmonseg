/**
 * Verifica MANUALMENTE se o KPI gerado do ARMAZEM dia 19 está correto.
 * Para cada linha do KPI, mostra:
 *  - Placa na escala?
 *  - GPS da placa: BASE, FORA, LOJA
 *  - Aplicação das regras: última BASE = SC, consolidar mesma loja
 */
import { readFileSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { lerKpi } from './_lib/ler-kpi'
import { parseEscalaArmazemGrao } from '@/lib/parsers/escala-armazem-grao'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 19'

function fmt(d: Date | null | undefined): string {
  if (!d) return '---'
  return String(d.getUTCHours()).padStart(2,'0') + ':' + String(d.getUTCMinutes()).padStart(2,'0')
}

;(async () => {
  console.log('═══ ESCALA ARMAZEM DIA 19 ═══')
  const escala = await parseEscalaArmazemGrao(
    readFileSync(BASE + '/ESCALA DO ARMAZÉM DO GRÃO MAIO (5).xlsx'),
    '2026-05-19',
  )
  const armazem = escala.filter(l => l.rede_id === 'ARMAZEM_GRAO')
  console.log(`Total escala ARMAZEM dia 19: ${armazem.length}\n`)
  for (const l of armazem) {
    console.log(`  ${l.loja_nome_raw.padEnd(45)} placa=${(l.placa_norm ?? '?').padEnd(10)} motorista=${l.motorista_nome ?? '?'}`)
  }

  console.log('\n═══ KPI GERADO (3).xlsx ═══')
  const kpi = await lerKpi('C:/Users/media/Downloads/KPI-ARMAZEM_GRAO-2026-05-19 (3).xlsx')
  console.log(`Total KPI gerado: ${kpi.length}\n`)
  for (const l of kpi) {
    console.log(`  ${l.loja.padEnd(45)} placa=${l.placa1.padEnd(10)} SC=${l.sc1} CHD=${l.chd1} SL=${l.sl1}`)
  }

  console.log('\n═══ UNITRAC DAS PLACAS DO ARMAZEM ═══')
  const pdf = await parseUnitracPdf(readFileSync(BASE + '/relatorio_9572.pdf'), new Set())
  const placasArmazem = new Set(armazem.map(l => l.placa_norm).filter(Boolean) as string[])
  for (const placa of placasArmazem) {
    const v = pdf.find(x => x.placa_norm === placa)
    if (!v) {
      console.log(`\n${placa}: PLACA NÃO ESTÁ NO UNITRAC`)
      continue
    }
    console.log(`\n${placa} — ${v.paradas.length} paradas:`)
    const sorted = [...v.paradas].sort((a, b) => +new Date(a.chegada) - +new Date(b.chegada))
    for (const p of sorted) {
      const dur = p.duracao_seg ? Math.round(p.duracao_seg / 60) + 'min' : '?'
      const nome = (p.nome_loja ?? p.local_parada ?? '').slice(0, 55)
      console.log(`  [${p.classificacao.padEnd(10)}] ${fmt(p.chegada)}-${fmt(p.saida)} (${dur.padStart(6)})  cod=${(p.codigo_loja ?? '-').padEnd(10)} ${nome}`)
    }
  }
})()
