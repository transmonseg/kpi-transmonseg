/**
 * Fixes pós-V2.1 — baseado na auditoria de unmatched.
 *
 * 1. SENDAS-as-ASSAI: setar codigo_escala em 3 lojas SENDAS pra casar com escala ASSAI
 *    - 560060 SENDAS SANTA CRUZ II → codigo_escala = '338'
 *    - 560062 SENDAS JACAREPAGUA (TAQUARA) → codigo_escala = '340'
 *    - 560054 SENDAS NOVA IGUACU II → codigo_escala = '291'
 *
 * 2. Consolidar 3 duplicatas ZONA_SUL detectadas:
 *    - 9039033 (sem lat) + 9039104 (com lat) → desativar 9039033, manter 9039104 com codigo_escala="33"
 *    - 9039048 (sem lat) + 9039121 (com lat) → desativar 9039048, manter 9039121 com codigo_escala="48"
 *    - 9039021 (sem lat) + 9039103 (com lat) → desativar 9039021, manter 9039103 com codigo_escala="21"
 *
 * 3. (Não DB — código fix) Aceitar "1º" e "1°" no tokensCore além de "1ª"
 *    → ver edit em matcher.ts
 *
 * Uso: npx tsx scripts/correcao/fixes_pos_v21.ts [--apply]
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

interface Acao {
  tipo: 'SET_COD_ESCALA' | 'DESATIVAR_E_MERGE'
  loja_codigo_unitrac?: string
  loja_nome?: string
  rede_id?: string
  novo_codigo_escala?: string
  desativar_codigo_unitrac?: string  // pra DESATIVAR_E_MERGE
  manter_codigo_unitrac?: string
  manter_codigo_escala?: string
}

const ACOES: Acao[] = [
  // 1. SENDAS-as-ASSAI
  { tipo: 'SET_COD_ESCALA', loja_codigo_unitrac: '560060', loja_nome: 'SENDAS SANTA CRUZ II', rede_id: 'SENDAS', novo_codigo_escala: '338' },
  { tipo: 'SET_COD_ESCALA', loja_codigo_unitrac: '560062', loja_nome: 'SENDAS JACAREPAGUA TAQUARA', rede_id: 'SENDAS', novo_codigo_escala: '340' },
  { tipo: 'SET_COD_ESCALA', loja_codigo_unitrac: '560054', loja_nome: 'SENDAS NOVA IGUACU II', rede_id: 'SENDAS', novo_codigo_escala: '291' },

  // 2. Consolidar ZS duplicatas
  { tipo: 'DESATIVAR_E_MERGE', desativar_codigo_unitrac: '9039033', manter_codigo_unitrac: '9039104', manter_codigo_escala: '33' },
  { tipo: 'DESATIVAR_E_MERGE', desativar_codigo_unitrac: '9039048', manter_codigo_unitrac: '9039121', manter_codigo_escala: '48' },
  { tipo: 'DESATIVAR_E_MERGE', desativar_codigo_unitrac: '9039021', manter_codigo_unitrac: '9039103', manter_codigo_escala: '21' },
]

async function main() {
  console.log(`=== FIXES PÓS-V2.1 ${APPLY ? '(APPLY)' : '(DRY-RUN)'} ===\n`)

  for (const a of ACOES) {
    if (a.tipo === 'SET_COD_ESCALA') {
      console.log(`SET_COD_ESCALA: ${a.loja_codigo_unitrac} ${a.loja_nome} → codigo_escala='${a.novo_codigo_escala}'`)
      if (APPLY) {
        const { error } = await supabase.from('lojas').update({ codigo_escala: a.novo_codigo_escala }).eq('codigo_unitrac', a.loja_codigo_unitrac!)
        if (error) console.error(`  ✗ ${error.message}`)
        else console.log(`  ✓`)
      }
    } else if (a.tipo === 'DESATIVAR_E_MERGE') {
      console.log(`DESATIVAR_E_MERGE: desativa ${a.desativar_codigo_unitrac}, mantém ${a.manter_codigo_unitrac} com codigo_escala='${a.manter_codigo_escala}'`)
      if (APPLY) {
        // Ordem: 1. limpar codigo_escala da antiga, 2. desativar antiga, 3. setar codigo_escala na nova
        const { error: e0 } = await supabase.from('lojas').update({ codigo_escala: null }).eq('codigo_unitrac', a.desativar_codigo_unitrac!)
        if (e0) { console.error(`  ✗ limpar codigo_escala antiga: ${e0.message}`); continue }
        const { error: e1 } = await supabase.from('lojas').update({ ativo: false }).eq('codigo_unitrac', a.desativar_codigo_unitrac!)
        if (e1) { console.error(`  ✗ desativar: ${e1.message}`); continue }
        const { error: e2 } = await supabase.from('lojas').update({ codigo_escala: a.manter_codigo_escala }).eq('codigo_unitrac', a.manter_codigo_unitrac!)
        if (e2) { console.error(`  ✗ codigo_escala: ${e2.message}`); continue }
        console.log(`  ✓`)
      }
    }
  }
}
main().catch(e => { console.error(e); process.exit(1) })
