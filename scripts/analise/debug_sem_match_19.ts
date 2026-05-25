import { readFileSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { parseEscalaArmazemGrao } from '@/lib/parsers/escala-armazem-grao'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { cruzaEscalaUnitrac } from '@/lib/kpi/matcher'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 19'
const DATA = '2026-05-19'

function fmt(d: any): string {
  if (!d) return '---'
  const dt = d instanceof Date ? d : new Date(d)
  return String(dt.getUTCHours()).padStart(2,'0') + ':' + String(dt.getUTCMinutes()).padStart(2,'0')
}

;(async () => {
  const escala = await parseEscalaArmazemGrao(readFileSync(BASE + '/ESCALA DO ARMAZÉM DO GRÃO MAIO (5).xlsx'), DATA)
  const armazem = escala.filter(l => l.rede_id === 'ARMAZEM_GRAO')

  console.log('═══ ESCALA ARMAZEM dia 19 ═══')
  for (const l of armazem) {
    console.log(`  ${l.loja_nome_raw.padEnd(45)} placa=${(l.placa_norm ?? '?').padEnd(10)} motorista=${l.motorista_nome ?? '?'}`)
  }

  const xlsx = await parseUnitrac(readFileSync(BASE + '/relatorio_9391.xlsx'))
  const pdf = await parseUnitracPdf(readFileSync(BASE + '/relatorio_9572.pdf'), new Set()).catch(() => [])
  const veiculosMap = new Map<string, any>()
  for (const v of xlsx) veiculosMap.set(v.placa_norm, v)
  for (const v of pdf) if (!veiculosMap.has(v.placa_norm)) veiculosMap.set(v.placa_norm, v)

  const placasEscala = new Set(armazem.map(l => l.placa_norm).filter(Boolean) as string[])

  console.log('\n═══ PARADAS de cada placa ARMAZEM ═══')
  for (const placa of placasEscala) {
    const v = veiculosMap.get(placa)
    if (!v) { console.log(`\n${placa}: AUSENTE no Unitrac`); continue }
    console.log(`\n${placa} — ${v.paradas.length} paradas:`)
    const sorted = [...v.paradas].sort((a, b) => +new Date(a.chegada) - +new Date(b.chegada))
    for (const p of sorted) {
      const dur = p.duracao_seg ? Math.round(p.duracao_seg/60) + 'min' : '?'
      console.log(`  [${p.classificacao.padEnd(10)}] ${fmt(p.chegada)}-${fmt(p.saida)} (${dur.padStart(6)})  cod=${(p.codigo_loja ?? '-').padEnd(10)} lat=${p.lat ?? '?'} lng=${p.lng ?? '?'} | ${(p.local_parada ?? '').slice(0,55)}`)
    }
  }
})()
