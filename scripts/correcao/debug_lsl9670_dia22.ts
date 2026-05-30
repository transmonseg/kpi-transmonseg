/**
 * Debug LSL9670 dia 22: escala vs Unitrac, ver matcher resultado.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { parseEscalaArmazemGrao } from '@/lib/parsers/escala-armazem-grao'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { cruzaEscalaUnitrac, scorePair, type EscalaLinhaRow, type UnitracParadaRow, type LojaRow } from '@/lib/kpi/matcher'
import type { ParadaUnitrac } from '@/lib/types/unitrac'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 22'
const DATA = '2026-05-22'

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: lojasData } = await supabase
    .from('lojas')
    .select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros, entrega_d1_fixo')
    .eq('ativo', true)
  const lojas = ((lojasData ?? []) as Record<string, unknown>[]).map(l => ({ ...l, sub_rede: null })) as unknown as LojaRow[]

  // Escala
  const bufE = readFileSync(`${BASE}/ESCALA DO ARMAZÉM DO GRÃO MAIO (6).xlsx`)
  const escalas = await parseEscalaArmazemGrao(bufE, DATA)
  const escalasLSL = escalas.filter(e => e.placa_norm === 'LSL9670')
  console.log(`=== Escala LSL9670 dia ${DATA} (ARMAZEM_GRAO) ===`)
  console.log(`Linhas: ${escalasLSL.length}`)
  for (const e of escalasLSL) {
    console.log(`  rede=${e.rede_id} | placa=${e.placa_norm} | ordem=${e.carro_ordem} | loja="${e.loja_nome_raw}" | cod=${e.loja_codigo_raw} | mot=${e.motorista_nome}`)
  }

  // Unitrac
  const bufU = readFileSync(`${BASE}/relatorio_9588.xlsx`)
  const viagens = await parseUnitrac(bufU) as unknown as Array<{ placa_norm: string, paradas: ParadaUnitrac[] }>
  const viagemLSL = viagens.find(v => v.placa_norm === 'LSL9670')
  console.log(`\n=== Unitrac LSL9670 dia ${DATA} ===`)
  if (!viagemLSL) { console.log('PLACA NÃO ESTÁ NO UNITRAC'); return }
  console.log(`Total paradas: ${viagemLSL.paradas.length}`)
  for (const p of viagemLSL.paradas) {
    const chegada = p.chegada instanceof Date ? p.chegada.toISOString().slice(11, 16) : '?'
    const saida = p.saida instanceof Date ? p.saida.toISOString().slice(11, 16) : '?'
    console.log(`  ${chegada}-${saida} | ${p.classificacao} | cod=${p.codigo_loja ?? '—'} | nome="${p.nome_loja ?? '—'}" | local="${(p.local_parada ?? '').slice(0, 60)}"`)
  }

  // Matcher
  console.log('\n=== Matcher resultado ===')
  const escalaRows: EscalaLinhaRow[] = escalasLSL.map((l, i) => ({
    id: `e-${i}`, rede_id: l.rede_id, placa_norm: l.placa_norm, loja_nome_raw: l.loja_nome_raw,
    loja_codigo_raw: l.loja_codigo_raw, motorista_nome: l.motorista_nome, carro_ordem: l.carro_ordem,
    data_entrega: l.data_entrega, sub_rede: l.sub_rede ?? null,
  }))
  const paradaRows: UnitracParadaRow[] = viagemLSL.paradas.map((p, i) => ({
    id: `p-${i}`, placa_norm: p.placa_norm,
    chegada: p.chegada instanceof Date ? p.chegada.toISOString() : String(p.chegada),
    saida: p.saida instanceof Date ? p.saida.toISOString() : (p.saida ? String(p.saida) : null),
    duracao_seg: p.duracao_seg ?? null,
    local_parada: p.local_parada ?? '', codigo_loja: p.codigo_loja ?? null, nome_loja: p.nome_loja ?? null,
    lat: p.lat ?? null, lng: p.lng ?? null, classificacao: p.classificacao, ordem: p.ordem,
  }))
  const rotas = await cruzaEscalaUnitrac(escalaRows, paradaRows, lojas)
  for (let i = 0; i < rotas.length; i++) {
    const r = rotas[i]
    const linha = escalasLSL[i]
    console.log(`  linha[${i}] "${linha.loja_nome_raw}": ${r.paradas.length} paradas, status=${r.status}`)
    for (const p of r.paradas) {
      const ch = new Date(p.chegada).toISOString().slice(11, 16)
      console.log(`    -> ${ch} | ${p.codigo_loja ?? '—'} | ${p.nome_loja ?? '—'}`)
    }
  }

  // Tabela: scorePair entre cada linha e cada parada LOJA
  console.log('\n=== scorePair matrix (linhas x paradas LOJA) ===')
  const paradasLoja = paradaRows.filter(p => p.classificacao === 'LOJA')
  console.log('Header: ' + paradasLoja.map((p, i) => `p${i}=${p.codigo_loja ?? '—'}`).join(' '))
  for (let li = 0; li < escalaRows.length; li++) {
    const linha = escalaRows[li]
    const scores = paradasLoja.map(p => scorePair(linha, p))
    console.log(`linha[${li}] "${linha.loja_nome_raw.slice(0, 30)}": ${scores.map(s => s === Infinity ? 'INF' : String(s)).join(' ')}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
