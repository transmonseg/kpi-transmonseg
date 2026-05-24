/**
 * Investigação profunda do KPI CAB-PETROPOLIS dia 22.
 * Olha TODAS as paradas brutas do Unitrac pra placa KNS-8D26 + escala completa.
 */
import { readFileSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { parseUnitrac } from '@/lib/parsers/unitrac'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 22'

function toHHMM(d: Date | string | null | undefined): string {
  if (!d) return '---'
  const x = typeof d === 'string' ? new Date(d) : d
  return String(x.getUTCHours()).padStart(2, '0') + ':' + String(x.getUTCMinutes()).padStart(2, '0')
}

async function main() {
  const veiculos = await parseUnitrac(readFileSync(BASE + '/relatorio_9588.xlsx'))
  const v = veiculos.find(x => x.placa_norm === 'KNS8D26')
  if (!v) { console.log('Placa não encontrada'); return }

  console.log(`Placa: ${v.placa_norm} — ${v.paradas.length} paradas TOTAIS\n`)
  console.log('# | classificacao | chegada → saida | dur | local | codigo_loja')
  console.log('-'.repeat(120))
  v.paradas.forEach((p, i) => {
    const dur = p.duracao_seg ? Math.round(p.duracao_seg / 60) + 'min' : '?'
    const cod = p.codigo_loja ?? '-'
    const local = (p.nome_loja ?? p.local_parada ?? '').slice(0, 50)
    console.log(`${String(i + 1).padStart(2)} | ${p.classificacao.padEnd(12)} | ${toHHMM(p.chegada)} → ${toHHMM(p.saida)} | ${dur.padStart(5)} | ${local.padEnd(50)} | ${cod}`)
  })

  console.log('\n=== Análise de viagens ===')
  let inLoja = false
  let lojaInicio: Date | null = null
  let lastBaseSaida: Date | null = null
  for (const p of v.paradas) {
    if (p.classificacao === 'BASE') {
      lastBaseSaida = p.saida instanceof Date ? p.saida : (p.saida ? new Date(p.saida) : null)
      console.log(`  BASE até ${toHHMM(p.saida)} — SC candidato`)
    }
    if (p.classificacao === 'LOJA' && !inLoja) {
      inLoja = true
      lojaInicio = p.chegada instanceof Date ? p.chegada : new Date(p.chegada as string)
      console.log(`  → CHEGOU em loja às ${toHHMM(p.chegada)} (após BASE saída ${lastBaseSaida ? toHHMM(lastBaseSaida) : 'N/A'})`)
    }
    if (p.classificacao !== 'LOJA' && inLoja) {
      inLoja = false
      console.log(`  ← SAIU de loja às ${toHHMM(p.chegada)}`)
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
