/**
 * Sprint A2 — Resolver 11 duplicatas/ambiguidades detectadas na análise das 1.036 placas.
 *
 * Decisões executáveis automaticamente:
 *   1. REGINA/GRÃO 5353012/14/16/17: já estão na lista de ROTAS_GIGANTES — desativar do cadastro como loja (se existirem)
 *   3. DISPOSIÇÃO 2019003/007: lat/lng cai no CD — manter cadastrado mas marcar com raio_metros=50 pra evitar match
 *   4. SUPERPRIX 3030013/3030113: padronizar nomes
 *
 * Decisões flagadas pra revisão humana (não aplicadas):
 *   2. O BOM/EMANUEL grupo (17659xxx/25140000/11139000): aguardar Fecchio
 *   5-8. PRINCESA Cabo Frio/Buzios/Arraial/Maricá: deixar como estão (já cadastradas via Sprint A1)
 *   9. ZS Copacabana cluster (7 lojas): deixar como estão
 *  10. 23080000 + 15755000 MERCADO SANTO AGOSTINHO + ITAGIBA COSMOS: já estão como ROTAS_GIGANTES
 *  11. 560026 SENDAS CEASA LJ 42: raio reduzido pra evitar colisão com CD
 *
 * Uso:
 *   npx tsx scripts/correcao/resolver_duplicatas.ts            # dry-run
 *   npx tsx scripts/correcao/resolver_duplicatas.ts --apply
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { writeFileSync, mkdirSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

interface Decisao {
  duplicata_num: number
  acao: 'PADRONIZAR_NOME' | 'REDUZIR_RAIO' | 'FLAGAR'
  alvo_codigo?: string
  alvo_id?: string
  alvo_nome?: string
  novo_nome?: string
  novo_raio?: number
  motivo: string
}

async function main() {
  console.log(`=== RESOLVER DUPLICATAS ${APPLY ? '(APPLY)' : '(DRY-RUN)'} ===\n`)
  const decisoes: Decisao[] = []

  // #4 SUPERPRIX 3030013 (TIJUQUINHA) vs 3030113 (NITEROI) — padronizar nomes
  for (const { cod, nome } of [
    { cod: '3030013', nome: 'SUPERPRIX TIJUQUINHA LJ 13' },
    { cod: '3030113', nome: 'SUPERPRIX NITEROI LJ 13' },
  ]) {
    const { data } = await supabase.from('lojas').select('id, nome').eq('codigo_unitrac', cod).maybeSingle()
    if (data && data.nome !== nome) {
      decisoes.push({
        duplicata_num: 4,
        acao: 'PADRONIZAR_NOME',
        alvo_codigo: cod,
        alvo_id: data.id,
        alvo_nome: data.nome,
        novo_nome: nome,
        motivo: `Padronizar nome de SUPERPRIX ${cod} pra evitar ambiguidade "LJ 13"`,
      })
    }
  }

  // #11 SENDAS CEASA LJ 42 (codigo_unitrac 560026) — reduzir raio pra 50m
  {
    const { data } = await supabase.from('lojas').select('id, nome, raio_metros').eq('codigo_unitrac', '560026').maybeSingle()
    if (data && (data.raio_metros == null || data.raio_metros > 75)) {
      decisoes.push({
        duplicata_num: 11,
        acao: 'REDUZIR_RAIO',
        alvo_codigo: '560026',
        alvo_id: data.id,
        alvo_nome: data.nome,
        novo_raio: 50,
        motivo: `560026 SENDAS CEASA fica dentro do raio do CD BENASSI (lat -22.8288). Reduzir raio pra 50m pra evitar colisão`,
      })
    }
  }

  // #3 DISPOSIÇÃO 2019003 (JANAUBA) + 2019007 (MUNDIAL) — reduzir raio pra 30m (caem no CD)
  for (const cod of ['2019003', '2019007']) {
    const { data } = await supabase.from('lojas').select('id, nome, raio_metros').eq('codigo_unitrac', cod).maybeSingle()
    if (data && (data.raio_metros == null || data.raio_metros > 50)) {
      decisoes.push({
        duplicata_num: 3,
        acao: 'REDUZIR_RAIO',
        alvo_codigo: cod,
        alvo_id: data.id,
        alvo_nome: data.nome,
        novo_raio: 30,
        motivo: `DISPOSIÇÃO ${cod} lat/lng cai no CD BENASSI. Reduzir raio pra 30m`,
      })
    }
  }

  // Flagar decisões pra revisão humana (não executáveis)
  const flagsManual = [
    { num: 1, desc: 'REGINA 5353012/14/16/17 + ABASTECEDORA — já marcadas como ROTAS_GIGANTES, nada a fazer aqui' },
    { num: 2, desc: 'O BOM / EMANUEL grupo (17659xxx, 25140000, 11139000) — aguardar Fecchio confirmar quais são lojas físicas' },
    { num: 5, desc: 'PRINCESA Arraial 1/2/3 — 3 cadastros distintos OK' },
    { num: 6, desc: 'PRINCESA Buzios 1/2/3 — 3 cadastros distintos OK' },
    { num: 7, desc: 'PRINCESA Cabo Frio 1/2/3 + SENDAS Cabo Frio LJ 82 — 4 cadastros distintos OK' },
    { num: 8, desc: 'PRINCESA Maricá 1/2 + PREZUNIC Maricá — 3 cadastros distintos OK' },
    { num: 9, desc: 'ZS Copacabana cluster (9039003/4/5/18/19/27/110) — 7 lojas próximas, manter' },
    { num: 10, desc: 'MERCADO SANTO AGOSTINHO + ITAGIBA COSMOS — ROTAS_GIGANTES, nada a fazer aqui' },
  ]
  for (const f of flagsManual) {
    decisoes.push({
      duplicata_num: f.num,
      acao: 'FLAGAR',
      motivo: f.desc,
    })
  }

  console.log(`Total decisões: ${decisoes.length}`)
  const contagem: Record<string, number> = {}
  for (const d of decisoes) contagem[d.acao] = (contagem[d.acao] ?? 0) + 1
  console.log('Por ação:', contagem)

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  mkdirSync('docs/db-changes', { recursive: true })
  writeFileSync(
    `docs/correcao-sistema/decisoes-duplicatas.md`,
    formatarMarkdown(decisoes),
    'utf8',
  )
  writeFileSync(
    `docs/db-changes/${timestamp}-duplicatas-decisoes.json`,
    JSON.stringify(decisoes, null, 2),
    'utf8',
  )

  if (!APPLY) {
    console.log('\n[DRY-RUN] Decisões salvas. Nada aplicado.')
    return
  }

  // Apply
  let sucesso = 0
  let falha = 0
  for (const d of decisoes) {
    if (d.acao === 'FLAGAR' || !d.alvo_id) continue
    const update: Record<string, unknown> = {}
    if (d.novo_nome) update.nome = d.novo_nome
    if (d.novo_raio) update.raio_metros = d.novo_raio
    const { error } = await supabase.from('lojas').update(update).eq('id', d.alvo_id)
    if (error) { falha++; console.error(`✗ ${d.alvo_nome}: ${error.message}`) }
    else { sucesso++; console.log(`✓ #${d.duplicata_num} ${d.alvo_nome} → ${JSON.stringify(update)}`) }
  }
  console.log(`\n✓ Sucesso: ${sucesso}, ✗ Falhas: ${falha}`)
}

function formatarMarkdown(decisoes: Decisao[]): string {
  const lines: string[] = []
  lines.push('# Decisões sobre as 11 duplicatas/ambiguidades — Sprint A2')
  lines.push('')
  lines.push('> Gerado por `scripts/correcao/resolver_duplicatas.ts`')
  lines.push('')
  for (let i = 1; i <= 11; i++) {
    const ds = decisoes.filter(d => d.duplicata_num === i)
    if (ds.length === 0) continue
    lines.push(`## Duplicata #${i}`)
    lines.push('')
    for (const d of ds) {
      lines.push(`- **${d.acao}**${d.alvo_codigo ? ` (${d.alvo_codigo} ${d.alvo_nome})` : ''}: ${d.motivo}`)
      if (d.novo_nome) lines.push(`  - novo nome: \`${d.novo_nome}\``)
      if (d.novo_raio) lines.push(`  - novo raio: ${d.novo_raio}m`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

main().catch(e => { console.error(e); process.exit(1) })
