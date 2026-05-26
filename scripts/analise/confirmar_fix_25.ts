/**
 * Simula a tela /painel/kpi/simples para a placa LCE-4337 ANDERSON dia 25.
 * Compara o que a tela mostrava antes (com bug) vs depois (fix).
 */
import { readFileSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { parseEscalaGeral } from '@/lib/parsers/escala-geral'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { cruzaEscalaUnitrac } from '@/lib/kpi/matcher'

const DATA = '2026-05-25'

function fmtHoraBRT(d: Date | null | undefined): string | null {
  if (!d) return null
  const h = d.getUTCHours()
  const m = d.getUTCMinutes()
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

;(async () => {
  const escala = await parseEscalaGeral(
    readFileSync('C:/Users/media/Downloads/ESCALA GERAL DE MAIO 0 (1).xlsx'),
    DATA
  )
  const linhasAnderson = escala.filter(l => l.placa_norm === 'LCE4337')

  const veiculos = await parseUnitracPdf(
    readFileSync('C:/Users/media/Downloads/relatorio_9612.pdf'),
    new Set()
  )
  const todasParadas = veiculos.flatMap(v => v.paradas)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
  const { data: lojasRaw } = await supabase
    .from('lojas')
    .select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros')
    .eq('ativo', true)
  const lojas = (lojasRaw ?? []) as any[]

  const escalaRow = linhasAnderson.map((l, i) => ({
    id: `esc-${i}`,
    rede_id: l.rede_id,
    placa_norm: l.placa_norm,
    loja_nome_raw: l.loja_nome_raw,
    loja_codigo_raw: l.loja_codigo_raw,
    motorista_nome: l.motorista_nome,
    carro_ordem: l.carro_ordem,
    data_entrega: l.data_entrega,
    sub_rede: l.sub_rede ?? null,
  }))
  const paradasRow = todasParadas.map((p, i) => ({
    id: `p-${i}`,
    placa_norm: p.placa_norm,
    chegada: p.chegada instanceof Date ? p.chegada.toISOString() : String(p.chegada),
    saida: p.saida instanceof Date ? p.saida.toISOString() : (p.saida ? String(p.saida) : null),
    duracao_seg: p.duracao_seg ?? null,
    local_parada: p.local_parada ?? '',
    codigo_loja: p.codigo_loja ?? null,
    nome_loja: p.nome_loja ?? null,
    lat: p.lat ?? null,
    lng: p.lng ?? null,
    classificacao: p.classificacao,
    ordem: p.ordem,
  }))

  const rotas = await cruzaEscalaUnitrac(escalaRow, paradasRow, lojas)

  console.log('\n=== TELA APÓS O FIX ===\n')
  console.log('| Ordem | Loja | Placa | Motorista | Turno | GPS | Saída CD | Ch. Loja | Tempo |')
  console.log('|---|---|---|---|---|---|---|---|---|')
  const sorted = rotas
    .map((r, i) => ({ r, esc: escalaRow.find(e => e.id === r.escala_linha_id)! }))
    .sort((a, b) => a.esc.loja_nome_raw.localeCompare(b.esc.loja_nome_raw, 'pt-BR'))
  sorted.forEach((item, idx) => {
    const tem_gps = !!(item.r.saida_cd || item.r.paradas.length > 0)
    console.log(`| ${idx + 1} | ${item.esc.loja_nome_raw} | LCE-4337 | ANDERSON | MANHA | ${tem_gps ? '✅' : '❌'} | ${fmtHoraBRT(item.r.saida_cd) ?? 'HH:MM'} | ${fmtHoraBRT(item.r.paradas[0]?.chegada) ?? 'HH:MM'} | ${item.r.paradas[0]?.duracao_min ?? '—'} |`)
  })
})()
