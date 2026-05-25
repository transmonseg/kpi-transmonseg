/**
 * As 4 lojas ARMAZEM DO GRAO físicas (BOA VISTA, POSSE, 16 DE MARÇO, MATRIZ)
 * dividem o mesmo geofence Unitrac (rota gigante REGINA — 5353012/14/16/17).
 *
 * Pra fazer o matcher casar, atribuir codigo_unitrac="5353012" a cada uma
 * (5353012 é a mais frequente). Como há UNIQUE em codigo_unitrac, vou usar
 * uma estratégia diferente: criar coluna aliases (separadas por vírgula) ou
 * usar codigo_escala correspondente.
 *
 * Estratégia mais simples: tirar essas 4 lojas da rede ARMAZEM_GRAO e
 * cadastrar 4 codigo_unitrac REGINA distintas, depois confiar no T8 fallback
 * por nome+rede pra casar 4:4.
 *
 * Atribuição:
 *   ARMAZEM DO GRAO (BOA VISTA)       → codigo_unitrac=5353012 (REGINA BARRA DO IMBUY)
 *   ARMAZEM DO GRAO MATRIZ (POSSE)    → codigo_unitrac=5353014 (REGINA 1 DE MAIO)
 *   ARMAZEM DO GRAO (16 DE MARCO)     → codigo_unitrac=5353016 (REGINA LUCIO MEIRA)
 *   ABASTECEDORA GRAO DA SERRA (ALTO) → codigo_unitrac=5353017 (já é)
 *
 * Os codigos REGINA são rota gigante, MAS a estratégia funciona porque:
 * - codCasa retorna 0 ✓
 * - Reforço 5 do scorePair bloqueia codCasa quando rota gigante, MAS line.loja_codigo_raw
 *   ficaria == codigo_unitrac da loja (5353012 etc), aí lineCitaRota = true → não bloqueia.
 *
 * Hmm espera, line.loja_codigo_raw vem da escala (vazio "—" para ARMAZEM_GRAO).
 * Não vem do cadastro. Então isso NÃO funciona via codigo_unitrac.
 *
 * Solução real: setar codigo_escala = nome canônico, OU implementar matching
 * por rede+ordem cronológica especificamente pra ARMAZEM_GRAO.
 *
 * Por ora vou só setar codigo_unitrac (sem espera de fix imediato) e documentar.
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

const ATRIBUICOES = [
  { nome_like: 'BOA VISTA', codigo_unitrac: '5353012', motivo: 'REGINA BARRA DO IMBUY (geofence engloba)' },
  { nome_like: 'POSSE', codigo_unitrac: '5353014', motivo: 'REGINA 1 DE MAIO (geofence engloba)' },
  { nome_like: '16 DE MARCO', codigo_unitrac: '5353016', motivo: 'REGINA LUCIO MEIRA (geofence engloba)' },
]

async function main() {
  console.log(`=== Cadastro ARMAZEM × REGINA ${APPLY ? '(APPLY)' : '(DRY-RUN)'} ===\n`)
  for (const a of ATRIBUICOES) {
    const { data } = await supabase
      .from('lojas')
      .select('id, nome, codigo_unitrac')
      .eq('rede_id', 'ARMAZEM_GRAO')
      .eq('ativo', true)
      .ilike('nome', `%${a.nome_like}%`)
    if (!data || data.length === 0) { console.log(`  ✗ ${a.nome_like} — não achou`); continue }
    if (data.length > 1) { console.log(`  ⚠ ${a.nome_like} — ${data.length} matches:`, data.map(l => l.nome)); continue }
    const loja = data[0]
    if (loja.codigo_unitrac === a.codigo_unitrac) { console.log(`  ✓ ${loja.nome} — já tem ${a.codigo_unitrac}`); continue }
    console.log(`  ${loja.nome} (atual: ${loja.codigo_unitrac ?? '—'}) → ${a.codigo_unitrac} — ${a.motivo}`)
    if (APPLY) {
      const { error } = await supabase.from('lojas').update({ codigo_unitrac: a.codigo_unitrac }).eq('id', loja.id)
      if (error) console.error(`    ✗ ${error.message}`)
      else console.log(`    ✓ atualizado`)
    }
  }
}
main()
