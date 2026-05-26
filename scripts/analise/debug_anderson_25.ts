import { readFileSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { parseEscalaGeral } from '@/lib/parsers/escala-geral'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { cruzaEscalaUnitrac } from '@/lib/kpi/matcher'

const DATA = '2026-05-25'

;(async () => {
  // Escala
  const escala = await parseEscalaGeral(
    readFileSync('C:/Users/media/Downloads/ESCALA GERAL DE MAIO 0 (1).xlsx'),
    DATA
  )
  const linhasAnderson = escala.filter(l => l.placa_norm === 'LCE4337')
  console.log(`Linhas escala ANDERSON: ${linhasAnderson.length}`)

  // Unitrac
  const veiculos = await parseUnitracPdf(
    readFileSync('C:/Users/media/Downloads/relatorio_9612.pdf'),
    new Set()
  )
  const todasParadas = veiculos.flatMap(v => v.paradas)

  // Lojas DB
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

  // Adaptar pro tipo
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

  // Cruzar
  const rotas = await cruzaEscalaUnitrac(escalaRow, paradasRow, lojas)
  console.log(`\nRotas geradas: ${rotas.length}\n`)
  function fmt(d: Date | string | null | undefined) {
    if (!d) return '---'
    const dt = typeof d === 'string' ? new Date(d) : d
    return String(dt.getUTCHours()).padStart(2,'0') + ':' + String(dt.getUTCMinutes()).padStart(2,'0')
  }
  for (const r of rotas) {
    const esc = escalaRow.find(e => e.id === r.escala_linha_id)
    console.log(`Linha: ${esc?.loja_nome_raw}`)
    console.log(`  saida_cd: ${fmt(r.saida_cd)}`)
    console.log(`  status: ${r.status}`)
    console.log(`  algoritmo: ${r._matchMeta?.algorithm} (conf=${r._matchMeta?.confidence})`)
    console.log(`  paradas (${r.paradas.length}):`)
    for (const p of r.paradas) {
      console.log(`    [${p.classificacao}] ${fmt(p.chegada)}-${fmt(p.saida)} dur=${p.duracao_min}min cod=${p.codigo_loja ?? '-'}`)
    }
    console.log('')
  }
})()
