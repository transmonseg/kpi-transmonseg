/**
 * Smoke test: roda parseAlteracaoPdfTabular + inferirSaiDaEscala no PDF
 * de alteração dia 19 (3). Identifica onde Sai fica null.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFileSync } from 'fs'
import { parseAlteracaoPdfTabular } from '@/lib/parsers/alteracao-pdf-tabular'
import { inferirSaiDaEscala } from '@/lib/parsers/inferir-sai'
import { createClient } from '@supabase/supabase-js'

const PDF = 'docs/conversas-tia-erica/dia-19/alteracoes/ALTERACAO DE ESCALA GERAL 19.05 (3).pdf'

async function main() {
  const buf = readFileSync(PDF)
  console.log(`PDF: ${PDF} (${buf.byteLength} bytes)\n`)

  const tabulares = await parseAlteracaoPdfTabular(buf)
  console.log(`=== parseAlteracaoPdfTabular: ${tabulares.length} alteracoes ===\n`)
  tabulares.forEach((t, i) => {
    console.log(`  [${i+1}] rede=${t.rede_id} loja="${t.loja_nome_raw}"`)
    console.log(`       tipo=${t.tipo}`)
    console.log(`       entra: ${t.entra?.motorista_nome ?? '(null)'} cod=${t.entra?.motorista_codigo ?? 'n'} placa=${t.entra?.placa_norm ?? '(null)'}`)
    console.log(`       sai:   ${t.sai?.motorista_nome ?? '(null)'} placa=${t.sai?.placa_norm ?? '(null)'}`)
  })

  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const inferidas = await inferirSaiDaEscala(tabulares, '2026-05-19', svc)

  console.log(`\n=== APOS inferirSaiDaEscala dia 19 ===\n`)
  inferidas.forEach((t, i) => {
    const mudou = (t.sai?.motorista_nome ?? null) !== (tabulares[i].sai?.motorista_nome ?? null)
    const marker = mudou ? '✅' : (t.sai?.motorista_nome ? '⚪' : '🔴')
    console.log(`  [${i+1}] ${marker} loja="${t.loja_nome_raw}"`)
    console.log(`       entra: ${t.entra?.motorista_nome ?? '(null)'} placa=${t.entra?.placa_norm ?? '(null)'}`)
    console.log(`       sai:   ${t.sai?.motorista_nome ?? '(null)'} cod=${(t.sai as { motorista_codigo?: number })?.motorista_codigo ?? 'n'} placa=${t.sai?.placa_norm ?? '(null)'}`)
  })

  const semSai = inferidas.filter(t => !t.sai?.motorista_nome).length
  console.log(`\n>> ${semSai}/${inferidas.length} alteracoes ainda SEM sai apos inferencia`)
}
main().catch(e => { console.error(e); process.exit(1) })
