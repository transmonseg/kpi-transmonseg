#!/usr/bin/env tsx
/**
 * Script de debug para investigar por que TML9I75, UFW0H63, TML7D61, UDC6I03
 * retornam n_paradas_matched=0 apesar de ter paradas LOJA no unitrac.
 * Roda direto: npx tsx mcp/debug-match.ts
 */

import 'dotenv/config'
import { config as dotenvConfig } from 'dotenv'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { cruzaEscalaUnitrac } from '../src/lib/kpi/matcher.js'

dotenvConfig({ path: resolve(process.cwd(), '.env.local') })

const PLACAS_DEBUG = ['TML9I75', 'UFW0H63', 'TML7D61', 'UDC6I03']
const DATA = '2026-05-20'

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const sb = createClient(url, key, { auth: { persistSession: false } })

  // 1. Busca escala
  const { data: escalaLinhas, error: escErr } = await sb
    .from('escala_linhas')
    .select('id, rede_id, placa_norm, loja_nome_raw, loja_codigo_raw, motorista_nome, carro_ordem, data_entrega')
    .eq('data_entrega', DATA)
    .in('placa_norm', PLACAS_DEBUG)
  if (escErr) throw new Error(`escala: ${escErr.message}`)
  console.log(`\n=== ESCALA LINHAS (${escalaLinhas?.length ?? 0}) ===`)
  for (const l of escalaLinhas ?? []) {
    console.log(`  ${l.placa_norm} | ${l.rede_id} | loja_codigo_raw="${l.loja_codigo_raw}" | "${l.loja_nome_raw}"`)
  }

  // 2. Busca paradas (sem limit → todas)
  const { data: paradaRows, error: parErr } = await sb
    .from('unitrac_paradas')
    .select('id, placa_norm, chegada, saida, duracao_seg, distancia_km, endereco, lat, lng, local_parada, codigo_loja, nome_loja, classificacao, loja_id, ordem, unitrac_uploads!inner(data_relatorio)')
    .eq('unitrac_uploads.data_relatorio', DATA)
    .in('placa_norm', PLACAS_DEBUG)
    .limit(50000)
  if (parErr) throw new Error(`paradas: ${parErr.message}`)
  console.log(`\n=== PARADAS UNITRAC (${paradaRows?.length ?? 0} total) ===`)
  for (const p of (paradaRows ?? []).filter(p => p.classificacao === 'LOJA')) {
    console.log(`  ${p.placa_norm} ord=${p.ordem} | ${p.classificacao} | cod=${p.codigo_loja} | "${p.nome_loja}" | ${p.chegada}`)
  }

  // 3. Busca lojas
  const { data: lojas } = await sb
    .from('lojas')
    .select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros')
    .eq('ativo', true)
    .limit(50000)
  console.log(`\n=== LOJAS (${lojas?.length ?? 0}) ===`)

  // 4. Roda matcher para cada placa separadamente
  for (const placa of PLACAS_DEBUG) {
    const linhas = (escalaLinhas ?? []).filter(l => l.placa_norm === placa)
    const paradas = (paradaRows ?? []).filter(p => p.placa_norm === placa)
    if (!linhas.length) { console.log(`\n${placa}: sem escala`); continue }
    if (!paradas.length) { console.log(`\n${placa}: sem paradas no unitrac`); continue }

    console.log(`\n=== ${placa} ===`)
    console.log(`  Escala: ${linhas.length} linhas, Unitrac: ${paradas.length} paradas`)

    const rotas = await cruzaEscalaUnitrac(linhas as any, paradas as any, (lojas ?? []) as any)
    for (const r of rotas) {
      const l = linhas.find(l => l.id === r.escala_linha_id)
      console.log(`  [${l?.loja_nome_raw}]`)
      console.log(`    matched: ${r.paradas.length > 0 ? 'SIM' : 'NÃO'} | paradas: ${r.paradas.length}`)
      if (r.paradas.length > 0) {
        const p = r.paradas[0]
        console.log(`    → ${p.nome} (chegada: ${p.chegada.toISOString()})`)
      }
    }
  }
}

main().catch(e => { console.error('ERRO:', e); process.exit(1) })
