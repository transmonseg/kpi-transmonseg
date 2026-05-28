/**
 * Debug: por que Loja 55 Bangu I aparece com JEFERSON BATALHA/UBO5E01 dia 19?
 * Escala original tinha DIEGO/KQB-3F31. Alteração era pra Loja 133 (Barra I Senna).
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFileSync } from 'fs'
import { parseEscalaGeral } from '@/lib/parsers/escala-geral'
import { parseAlteracaoPdfTabular } from '@/lib/parsers/alteracao-pdf-tabular'
import { inferirSaiDaEscala } from '@/lib/parsers/inferir-sai'
import { aplicarAlteracoes, parsedToConfirmada } from '@/lib/kpi/aplicar-alteracoes'
import { createClient } from '@supabase/supabase-js'

const ESCALA = 'docs/conversas-tia-erica/dia-25/escalas/ESCALA GERAL DE MAIO 0 (2).xlsx'
const PDF_ALT = 'docs/conversas-tia-erica/dia-19/alteracoes/ALTERACAO DE ESCALA GERAL 19.05 (3).pdf'

async function main() {
  const xlsxBuf = readFileSync(ESCALA)
  const linhas = await parseEscalaGeral(xlsxBuf, '2026-05-19')
  const ass = linhas.filter(l => l.rede_id === 'ASSAI')

  console.log('=== ESCALA dia 19 ORIGINAL (pre-alteracoes) — Loja 55, 133, 29, 211, 35 ===\n')
  const FOCO = ['55', '133', '29', '211', '35']
  for (const cod of FOCO) {
    const l = ass.find(x => x.loja_codigo_raw === cod)
    if (l) console.log(`  Loja ${cod}: ${l.motorista_nome}/${l.motorista_codigo} / ${l.placa_norm} / ${l.loja_nome_raw}`)
    else console.log(`  Loja ${cod}: NAO ACHADA NA ESCALA`)
  }

  // Alteracoes
  const altBuf = readFileSync(PDF_ALT)
  const altParsed = await parseAlteracaoPdfTabular(altBuf)
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const altInferidas = await inferirSaiDaEscala(altParsed, '2026-05-19', svc)
  console.log('\n=== ALTERACOES com sai inferido ===')
  altInferidas.forEach((a, i) => {
    console.log(`  [${i+1}] ${a.tipo} ${a.rede_id} "${a.loja_nome_raw}"`)
    console.log(`      entra: ${a.entra?.motorista_nome}/${a.entra?.placa_norm}`)
    console.log(`      sai:   ${a.sai?.motorista_nome ?? '(null)'}/${a.sai?.placa_norm ?? '(null)'}`)
  })

  // Apply
  const efetivas = aplicarAlteracoes([...linhas], altInferidas.map(parsedToConfirmada))
  const efAss = efetivas.filter(l => l.rede_id === 'ASSAI')

  console.log('\n=== ESCALA EFETIVA POS-ALTERACOES — Loja 55, 133, 29, 211, 35 ===\n')
  for (const cod of FOCO) {
    const l = efAss.find(x => x.loja_codigo_raw === cod)
    if (l) console.log(`  Loja ${cod}: ${l.motorista_nome}/${l.motorista_codigo} / ${l.placa_norm} / ${l.loja_nome_raw}`)
    else console.log(`  Loja ${cod}: NAO ACHADA`)
  }

  // Comparar todas
  console.log('\n=== DIFF ESCALA pré vs pós aplicarAlteracoes ===\n')
  let diff = 0
  for (const orig of ass) {
    const efet = efAss.find(x => x.loja_codigo_raw === orig.loja_codigo_raw && x.carro_ordem === orig.carro_ordem)
    if (!efet) continue
    if (orig.motorista_nome !== efet.motorista_nome || orig.placa_norm !== efet.placa_norm) {
      diff++
      console.log(`  Loja ${orig.loja_codigo_raw} "${orig.loja_nome_raw}":`)
      console.log(`    Antes: ${orig.motorista_nome}/${orig.placa_norm}`)
      console.log(`    Pos:   ${efet.motorista_nome}/${efet.placa_norm}`)
    }
  }
  console.log(`\nTotal de linhas modificadas: ${diff}`)
}
main().catch(e => { console.error(e); process.exit(1) })
