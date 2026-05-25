/**
 * Debug: por que LNG7110 dia 19 ASSAI Loja 338 não casa?
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { parseEscalaGeral } from '@/lib/parsers/escala-geral'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { cruzaEscalaUnitrac, scorePair, type EscalaLinhaRow, type UnitracParadaRow, type LojaRow } from '@/lib/kpi/matcher'
import type { LinhaEscala } from '@/lib/types/escala'
import type { ParadaUnitrac } from '@/lib/types/unitrac'

const BASE_DIR = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA'

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
  const { data: lojasData } = await supabase
    .from('lojas')
    .select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros, entrega_d1_fixo')
    .eq('ativo', true)
  const lojas = ((lojasData ?? []) as Record<string, unknown>[]).map(l => ({ ...l, sub_rede: null })) as unknown as LojaRow[]

  // Lojas com codigo_escala 338, 340, 291
  console.log('=== Lojas com codigo_escala 338/340/291 ===')
  for (const l of lojas.filter(l => ['338','340','291'].includes(l.codigo_escala ?? ''))) {
    console.log(`  [${l.rede_id}] codigo_escala=${l.codigo_escala} | codigo_unitrac=${l.codigo_unitrac} | ${l.nome}`)
  }

  // Carrega dia 19
  const bufG = readFileSync(`${BASE_DIR}/ESCALA DIA 19/ESCALA GERAL DE MAIO 1 (6).xlsx`)
  const escalas = await parseEscalaGeral(bufG, '2026-05-19')
  const bufU = readFileSync(`${BASE_DIR}/ESCALA DIA 19/relatorio_9391.xlsx`)
  const viagens = await parseUnitrac(bufU) as unknown as Array<{ placa_norm: string, paradas: ParadaUnitrac[] }>
  const paradas: ParadaUnitrac[] = []
  for (const v of viagens) for (const p of (v.paradas ?? [])) paradas.push(p)

  // Filtra linhas Loja 338
  const linhas338 = escalas.filter(e => e.rede_id === 'ASSAI' && (e.loja_codigo_raw === '338' || e.loja_nome_raw.includes('338')))
  console.log(`\n=== Escala dia 19, ASSAI Loja 338: ${linhas338.length} linhas ===`)
  for (const l of linhas338) {
    console.log(`  placa=${l.placa_norm} | nome=${l.loja_nome_raw} | cod=${l.loja_codigo_raw}`)
  }

  // Paradas da placa LNG7110
  const paradasLNG = paradas.filter(p => p.placa_norm === 'LNG7110')
  console.log(`\n=== Paradas LNG7110: ${paradasLNG.length} ===`)
  for (const p of paradasLNG.slice(0, 15)) {
    console.log(`  ${p.classificacao} | codigo_loja=${p.codigo_loja} | nome_loja=${p.nome_loja} | local=${p.local_parada?.slice(0,60) ?? ''}`)
  }

  // Roda matcher
  console.log('\n=== Match attempt ===')
  const escalaRows: EscalaLinhaRow[] = linhas338.map((l, i) => ({
    id: `e-${i}`, rede_id: l.rede_id, placa_norm: l.placa_norm, loja_nome_raw: l.loja_nome_raw,
    loja_codigo_raw: l.loja_codigo_raw, motorista_nome: l.motorista_nome, carro_ordem: l.carro_ordem,
    data_entrega: l.data_entrega, sub_rede: l.sub_rede ?? null,
  }))
  const paradaRows: UnitracParadaRow[] = paradasLNG.map((p, i) => ({
    id: `p-${i}`, placa_norm: p.placa_norm,
    chegada: p.chegada instanceof Date ? p.chegada.toISOString() : String(p.chegada),
    saida: p.saida instanceof Date ? p.saida.toISOString() : (p.saida ? String(p.saida) : null),
    duracao_seg: p.duracao_seg ?? null,
    local_parada: p.local_parada ?? '', codigo_loja: p.codigo_loja ?? null, nome_loja: p.nome_loja ?? null,
    lat: p.lat ?? null, lng: p.lng ?? null, classificacao: p.classificacao, ordem: p.ordem,
  }))
  const rotas = await cruzaEscalaUnitrac(escalaRows, paradaRows, lojas)
  for (const r of rotas) {
    console.log(`  rota: paradas=${r.paradas.length}, status=${r.status}, _matchMeta=${JSON.stringify(r._matchMeta)}`)
  }

  // scorePair direto pra debugar
  if (linhas338.length > 0 && paradasLNG.length > 0) {
    const lojaParada = paradasLNG.find(p => p.classificacao === 'LOJA')
    if (lojaParada) {
      const lin = escalaRows[0]
      const par = paradaRows.find(p => p.id === `p-${paradasLNG.indexOf(lojaParada)}`)!
      console.log(`\n=== scorePair entre linha[0] e parada LOJA ===`)
      console.log(`  linha.loja_codigo_raw = ${lin.loja_codigo_raw}`)
      console.log(`  parada.codigo_loja    = ${par.codigo_loja}`)
      console.log(`  parada.nome_loja      = ${par.nome_loja}`)
      console.log(`  scorePair = ${scorePair(lin, par)}`)
    }
  }
}
main().catch(e => { console.error(e); process.exit(1) })
