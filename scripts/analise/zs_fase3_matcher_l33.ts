import { readFileSync, readdirSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { cruzaEscalaUnitrac } from '@/lib/kpi/matcher'
import * as XLSX from 'xlsx'

const BASE_19 = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 19'

function fmt(d: any): string {
  if (!d) return '---'
  const dt = d instanceof Date ? d : new Date(d)
  return String(dt.getUTCHours()).padStart(2,'0') + ':' + String(dt.getUTCMinutes()).padStart(2,'0')
}

;(async () => {
  // Ler escala ZS dia 19
  const files = readdirSync(BASE_19)
  const escZs = files.find(f => /ZONA.*SUL/i.test(f) && f.endsWith('.xlsx'))!
  const xlsxFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))!
  const pdfFile = files.find(f => /relatorio.*\.pdf$/i.test(f))

  // Parse ZS escala
  const wb = XLSX.read(readFileSync(BASE_19 + '/' + escZs), { type: 'buffer' })
  // Acha aba dia 19
  const aba = wb.SheetNames.find(n => /19|MAIO|escala/i.test(n)) ?? wb.SheetNames[0]
  console.log(`Escala ZS aba: ${aba}`)
  const ws = wb.Sheets[aba]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as any[][]
  // Filtra linhas que parecem dia 19 (com placa BBH1C94)
  let entradaL33: any = null
  for (const r of rows) {
    if (!r) continue
    const txt = JSON.stringify(r)
    if (/BBH1C94|BBH-1C94/.test(txt)) {
      console.log(`  Linha BBH1C94: ${r.map(c => String(c ?? '').slice(0,15)).join(' | ')}`)
    }
  }
  // Pra simplificar, vamos só rodar matcher direto com escala ZS linha 33
  const escala: any[] = [{
    id: 'l33',
    rede_id: 'ZONA_SUL',
    placa_norm: 'BBH1C94',
    loja_nome_raw: 'ZONA SUL LOJA 33',
    loja_codigo_raw: '33',
    motorista_nome: 'JOSUE DOS SANTOS',
    carro_ordem: 1,
    data_entrega: '2026-05-19',
    sub_rede: null,
  }]

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

  const rotas = await cruzaEscalaUnitrac(escala, pRow, lojas ?? [])
  for (const r of rotas) {
    console.log(`\nRota Loja 33:`)
    console.log(`  status=${r.status} algo=${r._matchMeta?.algorithm}(${r._matchMeta?.score})`)
    console.log(`  saida_cd=${fmt(r.saida_cd)}`)
    for (const p of r.paradas) {
      const raw = pRow.find(rp => rp.id === p.parada_id)
      console.log(`  parada_id=${p.parada_id} ${fmt(p.chegada)}-${fmt(p.saida)} cod=${raw?.codigo_loja} lat=${raw?.lat} lng=${raw?.lng}`)
    }
  }
})()
