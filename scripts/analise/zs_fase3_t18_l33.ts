// Simula T18 manual: pq T18 não atribui BBH1C94 LOJA 05:29 pra escala LCO0978/Loja 33?
import { readFileSync, readdirSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { parseEscalaZonaSul } from '@/lib/parsers/escala-zona-sul'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { cruzaEscalaUnitrac } from '@/lib/kpi/matcher'

const BASE_19 = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 19'

function fmt(d: any): string {
  if (!d) return '---'
  const dt = d instanceof Date ? d : new Date(d)
  return String(dt.getUTCHours()).padStart(2,'0') + ':' + String(dt.getUTCMinutes()).padStart(2,'0')
}

;(async () => {
  const files = readdirSync(BASE_19)
  const escZs = files.find(f => /ZONA.*SUL/i.test(f) && f.endsWith('.xlsx'))!
  const xlsxFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))!
  const pdfFile = files.find(f => /relatorio.*\.pdf$/i.test(f))

  const escala = await parseEscalaZonaSul(readFileSync(BASE_19 + '/' + escZs), '2026-05-19')
  // Filtra só ZS (não outras redes que podem estar nesse arquivo)
  const zs = escala.filter(l => l.rede_id === 'ZONA_SUL')

  const xlsx = await parseUnitrac(readFileSync(BASE_19 + '/' + xlsxFile))
  const pdf = pdfFile ? await parseUnitracPdf(readFileSync(BASE_19 + '/' + pdfFile), new Set()).catch(() => []) : []
  const veiculos = new Map<string, any>()
  for (const v of xlsx) veiculos.set(v.placa_norm, v)
  for (const v of pdf) if (!veiculos.has(v.placa_norm)) veiculos.set(v.placa_norm, v)
  const todas = Array.from(veiculos.values()).flatMap(v => v.paradas)

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: lojas } = await sb
    .from('lojas')
    .select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros')
    .eq('ativo', true)

  const escRow = zs.map((l, i) => ({
    id: 'e'+i, rede_id: l.rede_id, placa_norm: l.placa_norm,
    loja_nome_raw: l.loja_nome_raw, loja_codigo_raw: l.loja_codigo_raw,
    motorista_nome: l.motorista_nome, carro_ordem: l.carro_ordem,
    data_entrega: l.data_entrega, sub_rede: l.sub_rede ?? null,
  }))
  const pRow = todas.map((p, i) => ({
    id: 'p'+i, placa_norm: p.placa_norm,
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
  // Foco em Loja 33, 21
  const alvos = ['Loja 33', 'Loja 21', 'Loja 47', 'Loja 01', 'Loja 09']
  for (const r of rotas) {
    const e = escRow.find(x => x.id === r.escala_linha_id)!
    if (!alvos.some(a => e.loja_nome_raw.includes(a))) continue
    console.log(`${e.loja_nome_raw.padEnd(40)} placa_escala=${e.placa_norm}`)
    console.log(`  status=${r.status} algo=${r._matchMeta?.algorithm}(${r._matchMeta?.score})`)
    console.log(`  saida_cd=${fmt(r.saida_cd)}`)
    for (const p of r.paradas) {
      const raw = pRow.find(rp => rp.id === p.parada_id)
      console.log(`  parada placa=${raw?.placa_norm} ${fmt(p.chegada)}-${fmt(p.saida)} cod=${raw?.codigo_loja}`)
    }
  }
})()
