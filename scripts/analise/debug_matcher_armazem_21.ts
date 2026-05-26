import { readFileSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { parseEscalaArmazemGrao } from '@/lib/parsers/escala-armazem-grao'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { cruzaEscalaUnitrac } from '@/lib/kpi/matcher'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 21'
const DATA = '2026-05-21'

function fmt(d: any): string {
  if (!d) return '---'
  const dt = d instanceof Date ? d : new Date(d)
  return String(dt.getUTCHours()).padStart(2,'0') + ':' + String(dt.getUTCMinutes()).padStart(2,'0')
}

;(async () => {
  const escala = await parseEscalaArmazemGrao(readFileSync(BASE + '/ESCALA DO ARMAZÉM DO GRÃO MAIO (6).xlsx'), DATA)
  const armazem = escala.filter(l => l.rede_id === 'ARMAZEM_GRAO')

  // XLSX + PDF combinados
  const xlsx = await parseUnitrac(readFileSync(BASE + '/relatorio_9552.xlsx'))
  const pdf = await parseUnitracPdf(readFileSync(BASE + '/relatorio_9553.pdf'), new Set()).catch(() => [])
  const veiculosMap = new Map<string, any>()
  for (const v of xlsx) veiculosMap.set(v.placa_norm, v)
  for (const v of pdf) {
    if (!veiculosMap.has(v.placa_norm)) veiculosMap.set(v.placa_norm, v)
  }
  const todasParadas = Array.from(veiculosMap.values()).flatMap(v => v.paradas)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  const { data: lojasRaw } = await supabase
    .from('lojas')
    .select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros')
    .eq('ativo', true)
  const lojas = (lojasRaw ?? []) as any[]

  // Adaptar pro tipo
  const escalaRow = armazem.map((l, i) => ({
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

  // Mostra paradas combinadas de QSU6I54 antes de chamar matcher
  console.log('═ Paradas COMBINADAS QSU6I54 ═')
  const paradasQSU = paradasRow.filter(p => p.placa_norm === 'QSU6I54').sort((a, b) => +new Date(a.chegada) - +new Date(b.chegada))
  for (const p of paradasQSU) {
    console.log(`  [${p.classificacao.padEnd(10)}] ${fmt(p.chegada)}-${fmt(p.saida)}  lat=${p.lat ?? '-'} lng=${p.lng ?? '-'} cod=${p.codigo_loja ?? '-'} | ${(p.local_parada ?? '').slice(0,50)}`)
  }

  const rotas = await cruzaEscalaUnitrac(escalaRow, paradasRow, lojas)
  console.log(`\nRotas geradas: ${rotas.length}\n`)
  for (const r of rotas) {
    const esc = escalaRow.find(e => e.id === r.escala_linha_id)!
    console.log(`${esc.placa_norm} | ${esc.loja_nome_raw.padEnd(45)} status=${r.status} algo=${r._matchMeta?.algorithm ?? '-'}(${r._matchMeta?.score ?? '?'})`)
    console.log(`   saida_cd=${fmt(r.saida_cd)}`)
    for (const p of r.paradas) {
      console.log(`   [${p.classificacao}] ${fmt(p.chegada)}-${fmt(p.saida)} cod=${p.codigo_loja ?? '-'} dur=${p.duracao_min}min`)
    }
  }
})()
