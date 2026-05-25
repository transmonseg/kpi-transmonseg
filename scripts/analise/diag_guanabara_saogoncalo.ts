/**
 * Diagnóstico: por que GUANABARA São Gonçalo Filial 12 não aparece
 * no KPI gerado do dia 19?
 *
 * Verifica:
 * 1. Está cadastrada na tabela `lojas`?
 * 2. Aparece na escala (PDF) do dia 19?
 * 3. Placa da escala está no Unitrac?
 */
import { readFileSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { parseEscalaGuanabaraPdf } from '@/lib/parsers/escala-guanabara-pdf'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 19'

;(async () => {
  console.log('═══ 1. Cadastro na tabela lojas ═══')
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  const { data: lojas } = await supabase
    .from('lojas')
    .select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, lat, lng, ativo')
    .eq('rede_id', 'GUANABARA')
    .or('nome.ilike.%são gonçalo%,nome.ilike.%sao goncalo%,codigo_escala.eq.12')

  console.log(`Encontradas ${lojas?.length ?? 0} lojas GUANABARA com "São Gonçalo" ou código 12:`)
  for (const l of (lojas ?? [])) {
    console.log(`  - id=${l.id} | nome="${l.nome}" | cod_escala=${l.codigo_escala} | cod_unitrac=${l.codigo_unitrac} | ativo=${l.ativo}`)
  }

  console.log('\n═══ 2. Escala GUANABARA dia 19 (PDF) ═══')
  const escala = await parseEscalaGuanabaraPdf(readFileSync(BASE + '/ESCALA 19.05.pdf'), '2026-05-19')
  console.log(`Total linhas escala GUANABARA dia 19: ${escala.length}`)
  const filiais = new Set<string>()
  let temFilial12 = false
  for (const l of escala) {
    if (l.rede_id !== 'GUANABARA') continue
    filiais.add(l.loja_codigo_raw ?? '?')
    if (l.loja_codigo_raw === '12' || (l.loja_nome_raw ?? '').toLowerCase().includes('gonçalo') || (l.loja_nome_raw ?? '').toLowerCase().includes('goncalo')) {
      temFilial12 = true
      console.log(`  → ENCONTREI: cod=${l.loja_codigo_raw} | loja=${l.loja_nome_raw} | placa=${l.placa_norm} | motorista=${l.motorista_nome}`)
    }
  }
  console.log(`Filiais únicas na escala: ${[...filiais].sort().join(', ')}`)
  console.log(`Filial 12 ou São Gonçalo na escala: ${temFilial12 ? 'SIM' : '❌ NÃO'}`)
})()
