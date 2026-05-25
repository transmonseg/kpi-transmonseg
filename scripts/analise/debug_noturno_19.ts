import { readFileSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { parseEscalaArmazemGrao } from '@/lib/parsers/escala-armazem-grao'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { cruzaEscalaUnitrac } from '@/lib/kpi/matcher'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 19'
const DATA = '2026-05-19'

function fmt(d: any): string {
  if (!d) return '---'
  const dt = d instanceof Date ? d : new Date(d)
  return String(dt.getUTCHours()).padStart(2,'0') + ':' + String(dt.getUTCMinutes()).padStart(2,'0')
}

;(async () => {
  // Acha arquivos automaticamente
  const fs = await import('fs')
  const files = fs.readdirSync(BASE)
  const escalaFile = files.find(f => /ESCALA.*ARMAZ.*\.xlsx$/i.test(f))
  const xlsxFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))
  const pdfFile = files.find(f => /relatorio.*\.pdf$/i.test(f))
  console.log(`Escala: ${escalaFile}`)
  console.log(`XLSX:   ${xlsxFile}`)
  console.log(`PDF:    ${pdfFile}\n`)
  if (!escalaFile || !xlsxFile) throw new Error('arquivos faltando')

  const escala = await parseEscalaArmazemGrao(readFileSync(BASE + '/' + escalaFile), DATA)
  const armazem = escala.filter(l => l.rede_id === 'ARMAZEM_GRAO')

  const xlsx = await parseUnitrac(readFileSync(BASE + '/' + xlsxFile))
  const veiculosMap = new Map<string, any>()
  for (const v of xlsx) veiculosMap.set(v.placa_norm, v)
  if (pdfFile) {
    const pdf = await parseUnitracPdf(readFileSync(BASE + '/' + pdfFile), new Set()).catch(() => [])
    for (const v of pdf) {
      if (!veiculosMap.has(v.placa_norm)) veiculosMap.set(v.placa_norm, v)
    }
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

  // Foco: lojas com timestamp noturno suspeito
  const ALVO = ['REGINA  LUCIO MEIRA', 'REGINA  1 DE MAIO', 'ARMAZEM DO GRAO A. BARRA DA TIJUCA']
  const rotas = await cruzaEscalaUnitrac(escalaRow, paradasRow, lojas)

  for (const rota of rotas) {
    const esc = escalaRow.find(e => e.id === rota.escala_linha_id)!
    if (!ALVO.some(a => esc.loja_nome_raw.includes(a.split(/\s+/).pop()!))) continue
    console.log(`\n${esc.placa_norm} | ${esc.loja_nome_raw}`)
    console.log(`   status=${rota.status}  algo=${rota._matchMeta?.algorithm}(${rota._matchMeta?.score})`)
    console.log(`   saida_cd=${fmt(rota.saida_cd)}`)
    for (const p of rota.paradas) {
      console.log(`   [${p.classificacao}] ${fmt(p.chegada)}-${fmt(p.saida)} cod=${p.codigo_loja ?? '-'} dur=${p.duracao_min}min  | ${(p.local_parada ?? '').slice(0,50)}`)
    }
    // Mostra TODAS as paradas dessa placa
    const todasDessaPlaca = paradasRow.filter(p => p.placa_norm === esc.placa_norm).sort((a, b) => +new Date(a.chegada) - +new Date(b.chegada))
    console.log(`   ─ Todas as paradas da placa (${todasDessaPlaca.length}):`)
    for (const p of todasDessaPlaca) {
      const dur = p.duracao_seg ? Math.round(p.duracao_seg/60) + 'min' : '?'
      console.log(`     [${p.classificacao.padEnd(10)}] ${fmt(p.chegada)}-${fmt(p.saida)} (${dur.padStart(6)})  cod=${(p.codigo_loja ?? '-').padEnd(10)} ${(p.local_parada ?? '').slice(0,50)}`)
    }
  }
})()
