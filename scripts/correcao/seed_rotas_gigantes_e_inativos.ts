/**
 * Sprint A3+A4 — Aplica migration + popula rotas_gigantes_unitrac + veiculos_inativos.
 *
 * Uso: npx tsx scripts/correcao/seed_rotas_gigantes_e_inativos.ts --apply
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')

interface LojaUnitrac {
  codigo: string
  nome: string
  classificacao: 'LOJA_INDIVIDUAL' | 'ROTA_GIGANTE'
  raio_metros: number
  paradas: number
}

const VEICULOS_INATIVOS = [
  // 31 placas CD-only crônicas identificadas na análise das 1.036 placas
  // (aparecem só BASE BENASSI em 4-5 dias dos 5 dias analisados)
  'ALS-4H33', 'AMI-1562', 'AMR-9986', 'AMW-4D50', 'DDI-6J90', 'DJB-6D42',
  'EOF-4331', 'EOF-4951', 'EVU-7F71', 'EZU-9325', 'EZU-9D26', 'EZU-9D27',
  'EZU-9J51', 'FTV-6F42', 'GAR-0802', 'GBC-6E12', 'GBG-5C11', 'GEB-9H31',
  'KPT-5B20', 'LQD-9H59', 'LRA-9C40', 'LRA-9C41', 'PVA-1H61', 'QSO-8D04',
  'SFG-2F72', 'SFG-2F73', 'UBF-5G32', 'UBF-5G33', 'UBF-5G36', 'UBG-7F79',
  'UFL-5C85',
]

async function main() {
  console.log(`=== SEED ROTAS_GIGANTES + VEICULOS_INATIVOS ${APPLY ? '(APPLY)' : '(DRY-RUN)'} ===\n`)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  // Carrega ROTAS_GIGANTES do JSON
  const todasLojas: LojaUnitrac[] = JSON.parse(readFileSync('docs/correcao-sistema/lojas-no-unitrac.json', 'utf8'))
  const rotas = todasLojas.filter(l => l.classificacao === 'ROTA_GIGANTE')
  console.log(`Rotas gigantes: ${rotas.length}`)
  console.log(`Veículos inativos: ${VEICULOS_INATIVOS.length}`)

  // Confirma que as tabelas existem (a migration deve ter sido aplicada via mcp__supabase__apply_migration ou direto no painel)
  const { error: errR } = await supabase.from('rotas_gigantes_unitrac').select('codigo', { count: 'exact', head: true })
  const { error: errV } = await supabase.from('veiculos_inativos').select('placa', { count: 'exact', head: true })
  if (errR) {
    console.error(`✗ Tabela rotas_gigantes_unitrac não existe: ${errR.message}`)
    console.error(`  Aplicar primeiro: supabase/migrations/20260524000000_rotas_gigantes_e_veiculos_inativos.sql`)
    process.exit(1)
  }
  if (errV) {
    console.error(`✗ Tabela veiculos_inativos não existe: ${errV.message}`)
    process.exit(1)
  }

  if (!APPLY) {
    console.log('\n[DRY-RUN] tabelas OK. Use --apply pra inserir.')
    return
  }

  // Insere rotas_gigantes
  const rotasRows = rotas.map(r => ({
    codigo: r.codigo,
    nome: r.nome,
    raio_estimado_metros: r.raio_metros,
    paradas_observadas: r.paradas,
    motivo: `Raio ${(r.raio_metros / 1000).toFixed(1)}km cobre múltiplas lojas — não usar como match exato`,
  }))
  // upsert pra ser idempotente
  const { error: e1 } = await supabase.from('rotas_gigantes_unitrac').upsert(rotasRows, { onConflict: 'codigo' })
  if (e1) console.error(`✗ erro rotas:`, e1.message)
  else console.log(`✓ ${rotasRows.length} rotas_gigantes inseridas/atualizadas`)

  const inativosRows = VEICULOS_INATIVOS.map(p => ({
    placa: p,
    motivo: 'CD-only crônico: 4-5 dias dos 5 analisados (18-22/05) só BASE BENASSI',
    dias_observados: 5,
  }))
  const { error: e2 } = await supabase.from('veiculos_inativos').upsert(inativosRows, { onConflict: 'placa' })
  if (e2) console.error(`✗ erro inativos:`, e2.message)
  else console.log(`✓ ${inativosRows.length} veiculos_inativos inseridos/atualizados`)

  // Auditoria
  const { count: countR } = await supabase.from('rotas_gigantes_unitrac').select('*', { count: 'exact', head: true })
  const { count: countV } = await supabase.from('veiculos_inativos').select('*', { count: 'exact', head: true })
  console.log(`\nTotal rotas_gigantes_unitrac: ${countR}`)
  console.log(`Total veiculos_inativos: ${countV}`)
}

main().catch(e => { console.error(e); process.exit(1) })
