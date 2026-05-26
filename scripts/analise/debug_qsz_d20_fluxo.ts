import { readFileSync, readdirSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { parseEscalaArmazemGrao } from '@/lib/parsers/escala-armazem-grao'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { cruzaEscalaUnitrac } from '@/lib/kpi/matcher'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 20'

function fmt(d: any): string {
  if (!d) return '---'
  const dt = d instanceof Date ? d : new Date(d)
  return String(dt.getUTCHours()).padStart(2,'0') + ':' + String(dt.getUTCMinutes()).padStart(2,'0')
}

;(async () => {
  const files = readdirSync(BASE)
  const escalaFile = files.find(f => /ESCALA.*ARMAZ.*\.xlsx$/i.test(f))!
  const xlsxFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))!
  const pdfFile = files.find(f => /relatorio.*\.pdf$/i.test(f))

  const escala = await parseEscalaArmazemGrao(readFileSync(BASE + '/' + escalaFile), '2026-05-20')
  const armazem = escala.filter(l => l.rede_id === 'ARMAZEM_GRAO')
  const xlsx = await parseUnitrac(readFileSync(BASE + '/' + xlsxFile))
  const pdf = pdfFile ? await parseUnitracPdf(readFileSync(BASE + '/' + pdfFile), new Set()).catch(() => []) : []
  const veiculos = new Map<string, any>()
  for (const v of xlsx) veiculos.set(v.placa_norm, v)
  for (const v of pdf) if (!veiculos.has(v.placa_norm)) veiculos.set(v.placa_norm, v)
  const todas = Array.from(veiculos.values()).flatMap(v => v.paradas)

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: lojas } = await sb.from('lojas').select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros').eq('ativo', true)

  const escRow = armazem.map((l, i) => ({ id: 'e'+i, rede_id: l.rede_id, placa_norm: l.placa_norm, loja_nome_raw: l.loja_nome_raw, loja_codigo_raw: l.loja_codigo_raw, motorista_nome: l.motorista_nome, carro_ordem: l.carro_ordem, data_entrega: l.data_entrega, sub_rede: l.sub_rede ?? null }))
  const pRow = todas.map((p, i) => ({ id: 'p'+i, placa_norm: p.placa_norm, chegada: p.chegada instanceof Date ? p.chegada.toISOString() : String(p.chegada), saida: p.saida instanceof Date ? p.saida.toISOString() : (p.saida ? String(p.saida) : null), duracao_seg: p.duracao_seg ?? null, local_parada: p.local_parada ?? '', codigo_loja: p.codigo_loja ?? null, nome_loja: p.nome_loja ?? null, lat: p.lat ?? null, lng: p.lng ?? null, classificacao: p.classificacao, ordem: p.ordem }))

  const rotas = await cruzaEscalaUnitrac(escRow, pRow, lojas ?? [])
  for (const r of rotas) {
    const e = escRow.find(x => x.id === r.escala_linha_id)!
    if (e.placa_norm !== 'QSZ9A20') continue
    console.log(`\n${e.placa_norm} | ${e.loja_nome_raw}`)
    console.log(`   status=${r.status} algo=${r._matchMeta?.algorithm}(${r._matchMeta?.score})`)
    for (const p of r.paradas) {
      const raw = pRow.find(rp => rp.id === p.parada_id)
      console.log(`   parada_id=${p.parada_id} ${fmt(p.chegada)}-${fmt(p.saida)} class=${p.classificacao} cod=${p.codigo_loja} lat=${raw?.lat} lng=${raw?.lng}`)
    }
  }
})()
