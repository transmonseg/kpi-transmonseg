/**
 * Bug 5 — CARREFOUR Campo Grande dia 19
 *
 * Manual:
 *  - 1º carro: SIMÃO / LSN-6I72 / 06:05/06:45
 *  - 2º carro: RENAN / KRW-8E86
 *
 * Gerado:
 *  - 1º carro: KIA SIMÃO / LSN-6I72
 *  - 2º carro: Simao Cod Placa / LSN-6I72  (DUPLICADO!)
 *
 * Hipóteses:
 *  5A: Matcher não cria rota separada por carro_ordem
 *  5B: Função que gera XLSX agrupa rotas por loja mas perde 2º carro
 *  5C: Escala não tem carro_ordem=2 (parser de escala não detectou)
 */
import { readFileSync, readdirSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { cruzaEscalaUnitrac, variantesOcr } from '@/lib/kpi/matcher'
import { agruparPorLoja } from '@/lib/kpi/agrupar-por-loja'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA'
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

function fmtT(d: any): string {
  if (!d) return '---'
  const dt = d instanceof Date ? d : new Date(d)
  return `${String(dt.getUTCHours()).padStart(2, '0')}:${String(dt.getUTCMinutes()).padStart(2, '0')}`
}

;(async () => {
  const data = '2026-05-19'
  console.log('=== STEP 1: Escala CARREFOUR Campo Grande dia 19 ===')

  const { data: escalaCG } = await sb
    .from('escala_linhas')
    .select(
      'id, rede_id, placa_norm, loja_nome_raw, loja_codigo_raw, motorista_nome, carro_ordem, data_entrega',
    )
    .eq('rede_id', 'CARREFOUR')
    .eq('data_entrega', data)
    .ilike('loja_nome_raw', '%campo grande%')

  console.log(`escala_linhas CARREFOUR Campo Grande: ${escalaCG?.length ?? 0} linhas`)
  for (const l of escalaCG || []) {
    console.log(
      `  id=${l.id.slice(0, 8)} placa=${l.placa_norm} motorista=${l.motorista_nome} loja="${l.loja_nome_raw}" cod=${l.loja_codigo_raw} carro_ordem=${l.carro_ordem}`,
    )
  }

  console.log('\n=== STEP 2: Todas escala_linhas CARREFOUR dia 19 ===')
  const { data: todasCarref } = await sb
    .from('escala_linhas')
    .select(
      'id, placa_norm, loja_nome_raw, motorista_nome, carro_ordem, loja_codigo_raw',
    )
    .eq('rede_id', 'CARREFOUR')
    .eq('data_entrega', data)
    .order('loja_nome_raw')

  for (const l of todasCarref || []) {
    console.log(
      `  ${l.placa_norm}  ${l.motorista_nome?.padEnd(18)} loja="${l.loja_nome_raw}" cod=${l.loja_codigo_raw ?? '---'} ordem=${l.carro_ordem}`,
    )
  }

  console.log('\n=== STEP 3: kpi_rotas dia 19 CARREFOUR Campo Grande ===')
  // Note: kpi_rotas só populado depois de processar_kpi. Pode estar vazio.
  const { data: rotasCG } = await sb
    .from('kpi_rotas')
    .select(
      'id, escala_linha_id, placa_norm, saida_cd, paradas_json, escala_linhas(motorista_nome, loja_nome_raw, carro_ordem)',
    )
    .eq('data', data)
    .eq('rede_id', 'CARREFOUR')

  const cgRotas = (rotasCG || []).filter((r: any) =>
    /campo grande/i.test(r.escala_linhas?.loja_nome_raw || ''),
  )
  console.log(`kpi_rotas CARREFOUR Campo Grande: ${cgRotas.length}`)
  for (const r of cgRotas as any[]) {
    console.log(
      `  escala_id=${r.escala_linha_id.slice(0, 8)} placa=${r.placa_norm} motorista=${r.escala_linhas?.motorista_nome} loja="${r.escala_linhas?.loja_nome_raw}" ordem=${r.escala_linhas?.carro_ordem}`,
    )
    const paradas = (r.paradas_json || []) as any[]
    for (const p of paradas) {
      console.log(
        `    parada ${fmtT(p.chegada)}-${fmtT(p.saida)} nome=${p.nome?.slice(0, 30)} cls=${p.classificacao}`,
      )
    }
  }

  console.log('\n=== STEP 4: kpi_linhas dia 19 CARREFOUR (output final) ===')
  const { data: kpiId } = await sb
    .from('kpis')
    .select('id')
    .eq('data', data)
    .eq('rede_id', 'CARREFOUR')
    .maybeSingle()

  if (kpiId) {
    const { data: kpiLinhas } = await sb
      .from('kpi_linhas')
      .select('*')
      .eq('kpi_id', kpiId.id)
    const cgLinhas = (kpiLinhas || []).filter((l: any) =>
      /campo grande/i.test(l.loja_nome || ''),
    )
    console.log(`kpi_linhas CARREFOUR Campo Grande: ${cgLinhas.length}`)
    for (const l of cgLinhas as any[]) {
      console.log(
        `  ordem=${l.ordem} loja="${l.loja_nome}" motorista="${l.motorista}" placa=${l.placa} carro_ordem=${l.carro_ordem}`,
      )
    }
  } else {
    console.log('  (sem kpi gerado pra CARREFOUR dia 19)')
  }

  console.log('\n=== STEP 5: Reproduzir agruparPorLoja com escala_linhas Campo Grande ===')
  // Simula o que aconteceria se as 2 linhas chegassem com paradas atribuídas.
  // O bug é apenas se as 2 linhas (1ª e 2ª) chegam ao agrupador com loja_nome IDÊNTICO
  // mas carro_ordem distinto.
  if ((escalaCG || []).length === 2) {
    const l1 = escalaCG![0]
    const l2 = escalaCG![1]
    console.log(`  linha1 loja_nome_raw="${l1.loja_nome_raw}" carro_ordem=${l1.carro_ordem}`)
    console.log(`  linha2 loja_nome_raw="${l2.loja_nome_raw}" carro_ordem=${l2.carro_ordem}`)
    if (l1.loja_nome_raw === l2.loja_nome_raw && l1.carro_ordem !== l2.carro_ordem) {
      console.log('  → loja_nome IDÊNTICO + carro_ordem DISTINTO → agrupador deve emitir carro1+carro2 OK')
    } else if (l1.loja_nome_raw === l2.loja_nome_raw && l1.carro_ordem === l2.carro_ordem) {
      console.log('  → BUG: loja_nome IGUAL e carro_ordem IGUAL — uma sobrescreve a outra!')
    } else {
      console.log('  → loja_nome DIFERENTE — vai pra grupos diferentes (não vira carro1+carro2)')
    }
  }

  console.log('\n=== STEP 6: Outras lojas afetadas ===')
  // ZS Loja 31 1ª, ZS MEGA BOX 2 noite, GUANABARA Vila Isabel F.36, GUANABARA Tijuca F.25
  const filtros = [
    { rede: 'ZONA_SUL', loja_pat: '%Loja 31%' },
    { rede: 'ZONA_SUL', loja_pat: '%MEGA BOX%' },
    { rede: 'GUANABARA', loja_pat: '%Vila Isabel%' },
    { rede: 'GUANABARA', loja_pat: '%Tijuca%' },
  ]
  for (const f of filtros) {
    const { data: rows } = await sb
      .from('escala_linhas')
      .select('id, placa_norm, loja_nome_raw, motorista_nome, carro_ordem, loja_codigo_raw')
      .eq('rede_id', f.rede)
      .eq('data_entrega', data)
      .ilike('loja_nome_raw', f.loja_pat)
    console.log(`\n  --- ${f.rede} ${f.loja_pat} (${rows?.length ?? 0} linhas) ---`)
    for (const l of rows || []) {
      console.log(
        `    ${l.placa_norm}  ${l.motorista_nome?.padEnd(20)} loja="${l.loja_nome_raw}" cod=${l.loja_codigo_raw ?? '---'} ordem=${l.carro_ordem}`,
      )
    }
  }

  process.exit(0)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
