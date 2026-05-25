/**
 * Diagnóstico profundo de uma placa específica:
 *   - O que a escala diz?
 *   - O que o GPS mostra?
 *   - O que o sistema retornou?
 */
import { readFileSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { parseEscalaZonaSul } from '@/lib/parsers/escala-zona-sul'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 19'
const DATA = '2026-05-19'

const PLACA = process.argv[2]?.toUpperCase()?.replace(/-/g, '') ?? 'LQU5546'

function fmtHHMM(d: Date): string {
  return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0')
}

async function main() {
  // ESCALA ZONA_SUL
  console.log(`═══ ESCALA ZONA_SUL — buscando placa ${PLACA} ═══\n`)
  const escala = await parseEscalaZonaSul(readFileSync(BASE + '/ESCALA ZONA SUL - MAIO (6).xlsx'), DATA)
  const minhas = escala.filter(l => l.placa_norm === PLACA)
  console.log(`Linhas na escala ZS: ${minhas.length}`)
  for (const l of minhas) {
    console.log(`  - ${l.motorista_nome} | rede=${l.rede_id} | loja_cod=${l.loja_codigo_raw} | loja=${l.loja_nome_raw} | carro=${l.carro_ordem}`)
  }

  // UNITRAC
  console.log(`\n═══ UNITRAC — placa ${PLACA} ═══\n`)
  const veicXlsx = await parseUnitrac(readFileSync(BASE + '/relatorio_9391.xlsx'))
  const veicPdf = await parseUnitracPdf(readFileSync(BASE + '/relatorio_9572.pdf'), new Set()).catch(() => [])

  const todos = new Map()
  for (const v of veicXlsx) todos.set(v.placa_norm, { src: 'XLSX', v })
  for (const v of veicPdf) if (!todos.has(v.placa_norm)) todos.set(v.placa_norm, { src: 'PDF', v })

  const item = todos.get(PLACA)
  if (!item) {
    console.log(`❌ Placa ${PLACA} NÃO ESTÁ no Unitrac (nem XLSX nem PDF)`)
    return
  }
  console.log(`Origem: ${item.src} | Total paradas: ${item.v.paradas.length}\n`)

  console.log('Todas as paradas em ordem cronológica:')
  const sorted = [...item.v.paradas].sort((a: any, b: any) => +new Date(a.chegada) - +new Date(b.chegada))
  for (const p of sorted) {
    const dur = p.duracao_seg ? Math.round(p.duracao_seg / 60) + 'min' : '?'
    const nome = (p.nome_loja ?? p.local_parada ?? '').slice(0, 70)
    const cod = p.codigo_loja ?? '-'
    console.log(`  [${p.classificacao.padEnd(9)}] ${fmtHHMM(p.chegada)}-${fmtHHMM(p.saida ?? p.chegada)} (${dur}) cod:${cod} → ${nome}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
