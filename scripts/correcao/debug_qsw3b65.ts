/**
 * Debug QSW3B65 dia 18 — placa ARMAZEM_GRAO com BOA VISTA + POSSE.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { parseEscalaArmazemGrao } from '@/lib/parsers/escala-armazem-grao'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { cruzaEscalaUnitrac, type EscalaLinhaRow, type UnitracParadaRow, type LojaRow } from '@/lib/kpi/matcher'
import type { ParadaUnitrac } from '@/lib/types/unitrac'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 18'

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: lojasData } = await supabase
    .from('lojas')
    .select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros, entrega_d1_fixo')
    .eq('ativo', true)
  const lojas = ((lojasData ?? []) as Record<string, unknown>[]).map(l => ({ ...l, sub_rede: null })) as unknown as LojaRow[]
  console.log('Lojas ARMAZEM_GRAO no cadastro:', lojas.filter(l => l.rede_id === 'ARMAZEM_GRAO').map(l => `${l.codigo_unitrac ?? '—'}|${l.nome}`).join('\n  '))

  const escalas = await parseEscalaArmazemGrao(readFileSync(`${BASE}/ESCALA DO ARMAZÉM DO GRÃO MAIO (5).xlsx`), '2026-05-18')
  const escalasQSW = escalas.filter(e => e.placa_norm === 'QSW3B65')
  console.log(`\nEscala QSW3B65 dia 18: ${escalasQSW.length} linhas`)
  for (const e of escalasQSW) console.log(`  rede=${e.rede_id} ordem=${e.carro_ordem} loja="${e.loja_nome_raw}" cod=${e.loja_codigo_raw ?? '—'}`)

  const viagens = await parseUnitrac(readFileSync(`${BASE}/relatorio_9402.xlsx`)) as unknown as Array<{ placa_norm: string, paradas: ParadaUnitrac[] }>
  const v = viagens.find(vv => vv.placa_norm === 'QSW3B65')
  if (!v) { console.log('Placa não está no Unitrac'); return }
  console.log(`\nUnitrac QSW3B65: ${v.paradas.length} paradas totais`)
  const lojaParadas = v.paradas.filter(p => p.classificacao === 'LOJA')
  console.log(`Paradas LOJA: ${lojaParadas.length}`)
  for (const p of lojaParadas) {
    const ch = p.chegada instanceof Date ? p.chegada.toISOString().slice(11, 16) : '?'
    console.log(`  ${ch} | cod=${p.codigo_loja ?? '—'} nome="${p.nome_loja ?? '—'}"`)
  }

  const escalaRows: EscalaLinhaRow[] = escalasQSW.map((l, i) => ({
    id: `e-${i}`, rede_id: l.rede_id, placa_norm: l.placa_norm, loja_nome_raw: l.loja_nome_raw,
    loja_codigo_raw: l.loja_codigo_raw, motorista_nome: l.motorista_nome, carro_ordem: l.carro_ordem,
    data_entrega: l.data_entrega, sub_rede: l.sub_rede ?? null,
  }))
  const paradaRows: UnitracParadaRow[] = v.paradas.map((p, i) => ({
    id: `p-${i}`, placa_norm: p.placa_norm,
    chegada: p.chegada instanceof Date ? p.chegada.toISOString() : String(p.chegada),
    saida: p.saida instanceof Date ? p.saida.toISOString() : (p.saida ? String(p.saida) : null),
    duracao_seg: p.duracao_seg ?? null,
    local_parada: p.local_parada ?? '', codigo_loja: p.codigo_loja ?? null, nome_loja: p.nome_loja ?? null,
    lat: p.lat ?? null, lng: p.lng ?? null, classificacao: p.classificacao, ordem: p.ordem,
  }))
  const rotas = await cruzaEscalaUnitrac(escalaRows, paradaRows, lojas)
  console.log('\n=== Matcher resultado ===')
  for (let i = 0; i < rotas.length; i++) {
    const r = rotas[i]
    const linha = escalasQSW[i]
    console.log(`  linha[${i}] "${linha.loja_nome_raw}": ${r.paradas.length} paradas`)
    for (const p of r.paradas as any[]) {
      const ch = new Date(p.chegada).toISOString().slice(11, 16)
      console.log(`    -> ${ch} | ${p.codigo_loja ?? '—'} | ${p.nome_loja ?? '—'}`)
    }
  }
}
main().catch(e => { console.error(e); process.exit(1) })
