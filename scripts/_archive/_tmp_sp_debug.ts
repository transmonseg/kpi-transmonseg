import { parseEscalaPax } from '@/lib/parsers/escala-pax'
import { parseEscalaGeral } from '@/lib/parsers/escala-geral'
import { readFileSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 20'

;(async () => {
  // PAX escala
  const paxFile = `${BASE}/ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (6).xlsx`
  const escPax = await parseEscalaPax(readFileSync(paxFile), '2026-05-20')
  const spPax = escPax.filter(l => l.rede_id === 'SUPERPRIX')
  console.log(`PAX — Total SUPERPRIX: ${spPax.length}`)
  for (const l of spPax) console.log('  ', l.loja_nome_raw?.padEnd(40), '| placa=', l.placa_norm)

  // GERAL escala
  const geralFile = `${BASE}/ESCALA GERAL DE MAIO 1 (7).xlsx`
  const escGeral = await parseEscalaGeral(readFileSync(geralFile), '2026-05-20')
  const spGeral = escGeral.filter(l => l.rede_id === 'SUPERPRIX')
  console.log(`\nGERAL — Total SUPERPRIX: ${spGeral.length}`)
  for (const l of spGeral) console.log('  ', l.loja_nome_raw?.padEnd(40), '| placa=', l.placa_norm)
})()
