/**
 * Smoke test: roda nosso parseAlteracaoPdfTabular + fallback texto
 * no PDF real ALTERACAO DE ESCALA GERAL 25.05 (1).pdf.
 *
 * Objetivo: ver o que o sistema EXTRAI desse PDF, e se ele pega
 * "Açaí Caxias 1, loja 131 — motorista X, código Y, placa Z".
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { readFileSync } from 'fs'
import { parseAlteracaoPdfTabular } from '@/lib/parsers/alteracao-pdf-tabular'
import { parseAlteracoesV2 } from '@/lib/parsers/alteracoes-v2'
import { blocoToParsed } from '@/lib/parsers/alteracoes-v2-adapter'
import { buildLookupContext } from '@/lib/parsers/lookup-canonical'
import { createClient } from '@supabase/supabase-js'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (b: Buffer) => Promise<{ text: string }>

const PDF_PATH = 'docs/conversas-tia-erica/dia-25/alteracoes/ALTERACAO DE ESCALA GERAL 25.05 (1).pdf'

async function main() {
  const buf = readFileSync(PDF_PATH)
  console.log(`PDF: ${PDF_PATH} (${buf.byteLength} bytes)\n`)

  // 1) Tentar tabular
  console.log('═══ 1) parseAlteracaoPdfTabular ═══')
  try {
    const tabulares = await parseAlteracaoPdfTabular(buf)
    console.log(`  Resultado: ${tabulares.length} alteracoes extraidas`)
    tabulares.forEach((t, i) => {
      console.log(`  ${i + 1}. rede=${t.rede_id} loja="${t.loja_nome_raw}"`)
      console.log(`      tipo=${t.tipo}`)
      console.log(`      entra: ${t.entra?.motorista_nome ?? '(null)'} cod=${t.entra?.motorista_codigo ?? 'n'} placa=${t.entra?.placa_norm ?? '(null)'}`)
      console.log(`      sai:   ${t.sai?.motorista_nome ?? '(null)'} cod=${t.sai?.motorista_codigo ?? 'n'} placa=${t.sai?.placa_norm ?? '(null)'}`)
    })
  } catch (e) {
    console.log('  ❌ Tabular falhou:', e instanceof Error ? e.message : String(e))
  }

  // 2) Texto bruto via pdf-parse
  console.log('\n═══ 2) Texto bruto (pdf-parse) ═══')
  const { text } = await pdfParse(buf)
  console.log('───────── TEXTO RAW ─────────')
  console.log(text)
  console.log('───────── /TEXTO RAW ────────\n')

  // 3) Parser v2 + ctx do banco
  console.log('═══ 3) parseAlteracoesV2 + adapter (com ctx do banco) ═══')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.log('  ⚠️  Sem env vars, pulando ctx do banco')
    return
  }
  const svc = createClient(url, key)
  const ctx = await buildLookupContext(svc)
  console.log(`  Ctx: ${ctx.associacoes.length} associacoes, ${ctx.lojas.length} lojas`)
  const blocos = parseAlteracoesV2(text, ctx)
  console.log(`  Blocos: ${blocos.length}`)
  const adapted = blocos.filter(b => b.entra || b.sai).map(blocoToParsed)
  console.log(`  Apos filtro: ${adapted.length}`)
  adapted.forEach((b, i) => {
    console.log(`\n  ${i + 1}. tipo=${b.tipo} rede=${b.rede_id} loja="${b.loja_nome_raw}"`)
    console.log(`      entra: ${b.entra?.motorista_nome ?? '(null)'} cod=${b.entra?.motorista_codigo ?? 'n'} placa=${b.entra?.placa_norm ?? '(null)'}`)
    console.log(`      sai:   ${b.sai?.motorista_nome ?? '(null)'} cod=${b.sai?.motorista_codigo ?? 'n'} placa=${b.sai?.placa_norm ?? '(null)'}`)
  })
}

main().catch(e => { console.error(e); process.exit(1) })
