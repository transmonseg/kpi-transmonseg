/**
 * FASE 0 — Aplica as propostas geradas por auto_preencher_unitrac.ts
 *
 * Antes de aplicar:
 *   1. Salva snapshot do estado atual em docs/db-changes/<timestamp>-rollback.json
 *   2. Gera script SQL de rollback em scripts/db-changes/<timestamp>-rollback.sql
 *
 * Depois aplica os UPDATEs na tabela lojas.
 *
 * Uso: npx tsx scripts/correcao/aplicar_propostas_unitrac.ts [--dry-run]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

const DRY_RUN = process.argv.includes('--dry-run')

interface Proposta {
  loja_id: string
  loja_nome: string
  rede_id: string
  campo: 'codigo_unitrac' | 'nome_unitrac'
  valor_proposto: string
  confianca: number
  evidencia: { detalhes: string }
}

async function main() {
  console.log(`=== APLICAR PROPOSTAS UNITRAC ${DRY_RUN ? '(DRY RUN)' : ''} ===\n`)

  const data = JSON.parse(readFileSync('docs/db-changes/2026-05-24-propostas-unitrac.json', 'utf8'))
  let propostas: Proposta[] = data.propostas
  console.log(`Total propostas: ${propostas.length}`)

  // Detectar e remover propostas conflitantes: mesmo (campo, valor) para múltiplas lojas
  // (ex: REGINA BARRA DO IMBUY proposto pra 3 lojas REGINA → ambíguo, manda pra revisão)
  const chavesContagem = new Map<string, number>()
  for (const p of propostas) {
    const chave = `${p.campo}|${p.valor_proposto}`
    chavesContagem.set(chave, (chavesContagem.get(chave) ?? 0) + 1)
  }
  const conflitantes = propostas.filter(p => (chavesContagem.get(`${p.campo}|${p.valor_proposto}`) ?? 0) > 1)
  const limpas = propostas.filter(p => (chavesContagem.get(`${p.campo}|${p.valor_proposto}`) ?? 0) === 1)
  if (conflitantes.length > 0) {
    console.log(`\n⚠ ${conflitantes.length} propostas conflitantes (mesmo valor pra múltiplas lojas) — não serão aplicadas:`)
    for (const p of conflitantes) console.log(`   ${p.rede_id} | ${p.loja_nome} → ${p.campo}=${p.valor_proposto}`)
    const conflitoPath = 'docs/db-changes/2026-05-24-conflitos.json'
    writeFileSync(conflitoPath, JSON.stringify(conflitantes, null, 2), 'utf8')
    console.log(`   Salvos em ${conflitoPath} pra revisão manual.\n`)
  }
  propostas = limpas
  console.log(`Propostas aplicáveis (sem conflitos): ${propostas.length}`)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  // Snapshot do estado atual das lojas afetadas
  const lojaIds = [...new Set(propostas.map(p => p.loja_id))]
  console.log(`Lojas afetadas: ${lojaIds.length}`)

  const { data: lojasAntes, error: errSnap } = await supabase
    .from('lojas')
    .select('id, rede_id, nome, codigo_unitrac, nome_unitrac')
    .in('id', lojaIds)
  if (errSnap) throw errSnap

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  mkdirSync('scripts/db-changes', { recursive: true })

  // Snapshot JSON pra recovery
  const snapshotPath = `docs/db-changes/${timestamp}-snapshot-lojas-antes.json`
  writeFileSync(snapshotPath, JSON.stringify(lojasAntes, null, 2), 'utf8')
  console.log(`Snapshot salvo: ${snapshotPath}`)

  // SQL rollback
  const rollbackSql = lojasAntes!.map(l =>
    `UPDATE lojas SET codigo_unitrac = ${l.codigo_unitrac ? `'${l.codigo_unitrac}'` : 'NULL'}, nome_unitrac = ${l.nome_unitrac ? `'${l.nome_unitrac.replace(/'/g, "''")}'` : 'NULL'} WHERE id = '${l.id}';  -- ${l.nome}`
  ).join('\n')
  const rollbackPath = `scripts/db-changes/${timestamp}-rollback-unitrac.sql`
  writeFileSync(rollbackPath, rollbackSql + '\n', 'utf8')
  console.log(`Rollback SQL: ${rollbackPath}`)

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Nenhum UPDATE foi aplicado.')
    console.log(`\nExemplos do que seria aplicado:`)
    for (const p of propostas.slice(0, 10)) {
      console.log(`  UPDATE lojas SET ${p.campo} = '${p.valor_proposto}' WHERE id = '${p.loja_id}' -- ${p.loja_nome}`)
    }
    return
  }

  // Aplicar — UPDATE por proposta individual (cada campo separado) pra que erro em codigo_unitrac
  // não impeça nome_unitrac da mesma loja
  console.log(`\nAplicando ${propostas.length} UPDATEs individuais...`)
  let sucesso = 0
  let falha = 0
  const erros: Array<{ loja_id: string; loja_nome: string; campo: string; valor: string; erro: string }> = []

  for (const p of propostas) {
    const updates = { [p.campo]: p.valor_proposto }
    const { error } = await supabase.from('lojas').update(updates).eq('id', p.loja_id)
    if (error) {
      falha++
      erros.push({ loja_id: p.loja_id, loja_nome: p.loja_nome, campo: p.campo, valor: p.valor_proposto, erro: error.message })
    } else {
      sucesso++
    }
  }

  console.log(`\n=== RESULTADO ===`)
  console.log(`✓ Sucesso: ${sucesso}`)
  console.log(`✗ Falhas:  ${falha}`)

  if (erros.length > 0) {
    const errosPath = `docs/db-changes/${timestamp}-erros.json`
    writeFileSync(errosPath, JSON.stringify(erros, null, 2), 'utf8')
    console.log(`Erros salvos: ${errosPath}`)
  }

  // Re-auditoria
  console.log('\n=== AUDITORIA PÓS-APLICAÇÃO ===')
  const { data: depois } = await supabase
    .from('lojas')
    .select('codigo_unitrac, nome_unitrac')
    .eq('ativo', true)
  const total = depois?.length ?? 0
  const semCodigo = (depois ?? []).filter(l => !l.codigo_unitrac).length
  const semNome = (depois ?? []).filter(l => !l.nome_unitrac).length
  console.log(`Total lojas: ${total}`)
  console.log(`  Sem codigo_unitrac: ${semCodigo} (${((semCodigo / total) * 100).toFixed(0)}%)`)
  console.log(`  Sem nome_unitrac:   ${semNome} (${((semNome / total) * 100).toFixed(0)}%)`)
  console.log(`\nRollback disponível: ${rollbackPath}`)
}

main().catch(e => { console.error(e); process.exit(1) })
