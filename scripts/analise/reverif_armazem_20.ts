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

// Manual dia 20 do KPI ARMAZEM DO GRAO.xlsx aba 20
const MANUAL: Record<string, { sc: string; chd: string; sl: string }> = {
  'REGINA  BARRA DO IMBUY':         { sc: '12:35', chd: '15:40', sl: '17:15' },
  'REGINA  1 DE MAIO':              { sc: '12:35', chd: '15:15', sl: '15:25' },
  'REGINA  LUCIO MEIRA':            { sc: '12:35', chd: '14:25', sl: '14:35' },
  'ABASTECEDORA GRÃO DA SERRA (ALTO)': { sc: '12:35', chd: '14:45', sl: '15:05' },
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
    if (!MANUAL[e.loja_nome_raw]) continue
    const sc = fmt(r.saida_cd)
    const chd = r.paradas[0] ? fmt(r.paradas[0].chegada) : '---'
    const sl = r.paradas[0] ? fmt(r.paradas[0].saida) : '---'
    const m = MANUAL[e.loja_nome_raw]
    const sys = `${sc}/${chd}/${sl}`
    const man = `${m.sc}/${m.chd}/${m.sl}`
    const ok = chd === m.chd && sl === m.sl ? '✅' : (chd === '---' ? '❌' : '⚠️')
    console.log(`  ${ok} ${e.loja_nome_raw.padEnd(40)} sys=${sys}  man=${man}`)
  }
})()
