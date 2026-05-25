import { readFileSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { parseEscalaArmazemGrao } from '@/lib/parsers/escala-armazem-grao'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { cruzaEscalaUnitrac } from '@/lib/kpi/matcher'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 19'

function fmt(d: any): string {
  if (!d) return '---'
  const dt = d instanceof Date ? d : new Date(d)
  return String(dt.getUTCHours()).padStart(2,'0') + ':' + String(dt.getUTCMinutes()).padStart(2,'0')
}

;(async () => {
  const escala = await parseEscalaArmazemGrao(readFileSync(BASE + '/ESCALA DO ARMAZÉM DO GRÃO MAIO (5).xlsx'), '2026-05-19')
  const armazem = escala.filter(l => l.rede_id === 'ARMAZEM_GRAO')
  const xlsx = await parseUnitrac(readFileSync(BASE + '/relatorio_9391.xlsx'))
  const pdf = await parseUnitracPdf(readFileSync(BASE + '/relatorio_9572.pdf'), new Set()).catch(() => [])
  const veiculos = new Map<string, any>()
  for (const v of xlsx) veiculos.set(v.placa_norm, v)
  for (const v of pdf) if (!veiculos.has(v.placa_norm)) veiculos.set(v.placa_norm, v)
  const todas = Array.from(veiculos.values()).flatMap(v => v.paradas)

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  const { data: lojas } = await sb
    .from('lojas')
    .select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros')
    .eq('ativo', true)

  const escRow = armazem.map((l, i) => ({
    id: 'e' + i, rede_id: l.rede_id, placa_norm: l.placa_norm,
    loja_nome_raw: l.loja_nome_raw, loja_codigo_raw: l.loja_codigo_raw,
    motorista_nome: l.motorista_nome, carro_ordem: l.carro_ordem,
    data_entrega: l.data_entrega, sub_rede: l.sub_rede ?? null,
  }))
  const pRow = todas.map((p, i) => ({
    id: 'p' + i, placa_norm: p.placa_norm,
    chegada: p.chegada instanceof Date ? p.chegada.toISOString() : String(p.chegada),
    saida: p.saida instanceof Date ? p.saida.toISOString() : (p.saida ? String(p.saida) : null),
    duracao_seg: p.duracao_seg ?? null,
    local_parada: p.local_parada ?? '',
    codigo_loja: p.codigo_loja ?? null,
    nome_loja: p.nome_loja ?? null,
    lat: p.lat ?? null, lng: p.lng ?? null,
    classificacao: p.classificacao, ordem: p.ordem,
  }))

  const rotas = await cruzaEscalaUnitrac(escRow, pRow, lojas ?? [])
  // Manual aba 19
  const manual: Record<string, string> = {
    'REGINA  BARRA DO IMBUY': '12:40/15:40/16:25',
    'REGINA  1 DE MAIO': '12:40/14:20/14:30',
    'REGINA  LUCIO MEIRA': '12:40/14:35/14:55',
    'ABASTECEDORA GRÃO DA SERRA (ALTO)': '12:40/15:05/15:25',
    'ARMAZÉM DO GRÃO ( BOA VISTA)': '14:15/15:30/15:55',
    'ARMAZÉM DO GRÃO MATRIZ ( POSSE)': '14:15/16:50/17:55',
    'ARMAZEM DO GRÃO (ITAIPAVA)': '12:40/14:10/14:20',
    'ARMAZEM DO GRAO (CORREAS)': '12:40/14:30/14:45',
    'ARMAZEM DO GRÃO (VALPARAÍSO)': '13:50/15:25/15:45',
    'ARMAZEM DO GRÃO  (MOSELA)': '13:50/16:00/16:30',
    'ARMAZEM DO GRÃO (QUITANDINHA)': '13:50/15:00/15:20',
    'ARMAZEM DO GRÃO (CAPELA)': '13:10/15:30/16:00',
    'ARMAZEM DO GRAO (16 DE MARÇO)': '13:10/16:00/16:20',
    'ARMAZEM DO GRAO A. BARRA DA TIJUCA': '13:15/14:10/14:40',
  }
  let ok = 0
  for (const r of rotas) {
    const e = escRow.find(x => x.id === r.escala_linha_id)!
    const sc = fmt(r.saida_cd)
    const chd = r.paradas[0] ? fmt(r.paradas[0].chegada) : '---'
    const sl = r.paradas[0] ? fmt(r.paradas[0].saida) : '---'
    const sys = `${sc}/${chd}/${sl}`
    const man = manual[e.loja_nome_raw] ?? '?'
    const match = sys === man ? '✅' : '❌'
    if (sys === man) ok++
    console.log(`  ${match} ${e.loja_nome_raw.padEnd(40)} sys=${sys}  man=${man}`)
  }
  console.log(`\n${ok}/14 ✅`)
})()
