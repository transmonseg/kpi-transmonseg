/**
 * Importa escalas + Unitrac do dia 22/05 (faltavam no banco).
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFileSync, existsSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { parseEscalaGeral } from '@/lib/parsers/escala-geral'
import { parseEscalaZonaSul } from '@/lib/parsers/escala-zona-sul'
import { parseEscalaPax } from '@/lib/parsers/escala-pax'
import { parseEscalaArmazemGrao } from '@/lib/parsers/escala-armazem-grao'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const FAKE_USER = 'c76b6f16-a988-480b-84e9-3c2e9038559a'
const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 22'
const DATA = '2026-05-22'
const CONTROL = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]', 'g')
const san = (s: string | null | undefined) => s == null ? null : s.replace(CONTROL, '')
function clean<T>(v: T): T {
  if (typeof v === 'string') return v.replace(CONTROL, '') as T
  if (v == null) return v
  if (Array.isArray(v)) return v.map(clean) as T
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = clean(val)
    return out as T
  }
  return v
}

const ESCALAS = [
  { tipo: 'GERAL',        arquivo: 'ESCALA GERAL DE MAIO 0.xlsx', parser: parseEscalaGeral },
  { tipo: 'PAX',          arquivo: 'ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (7).xlsx', parser: parseEscalaPax },
  { tipo: 'ARMAZEM_GRAO', arquivo: 'ESCALA DO ARMAZÉM DO GRÃO MAIO (6).xlsx', parser: parseEscalaArmazemGrao },
  { tipo: 'ZONA_SUL',     arquivo: 'ESCALA ZONA SUL - MAIO (8).xlsx', parser: parseEscalaZonaSul },
] as const

;(async () => {
  console.log(`Subindo dados ${DATA}...`)

  // Limpa antigo
  const { data: ex } = await sb.from('escala_uploads').select('id').eq('data_escala', DATA)
  if (ex?.length) {
    await sb.from('escala_linhas').delete().in('escala_upload_id', ex.map(u => u.id))
    await sb.from('escala_uploads').delete().in('id', ex.map(u => u.id))
  }

  for (const e of ESCALAS) {
    const path = `${BASE}/${e.arquivo}`
    if (!existsSync(path)) { console.log(`  ✗ ${e.tipo}: arquivo não existe`); continue }
    const linhas = await e.parser(readFileSync(path), DATA)
    if (linhas.length === 0) { console.log(`  ⚠ ${e.tipo}: 0 linhas`); continue }
    const { data: up } = await sb.from('escala_uploads').insert({
      data_escala: DATA, tipo: e.tipo, arquivo_path: path, nome_arquivo: e.arquivo,
      qtd_linhas: linhas.length, status: 'processado', uploaded_by: FAKE_USER, processado_em: new Date().toISOString(),
    }).select('id').single()
    if (!up) continue
    const rows = linhas.map((l: any) => ({
      escala_upload_id: up.id, rede_id: l.rede_id, sub_rede: l.sub_rede,
      loja_nome_raw: san(l.loja_nome_raw), loja_codigo_raw: san(l.loja_codigo_raw),
      placa_norm: san(l.placa_norm), placa_raw: san(l.placa_raw),
      motorista_nome: san(l.motorista_nome), motorista_codigo: san(l.motorista_codigo),
      tipo_carro: san(l.tipo_carro), carro_ordem: l.carro_ordem, turno: l.turno,
      obs: san(l.obs), restricao: san(l.restricao), peso_kg: l.peso_kg, paletes: l.paletes,
      data_entrega: l.data_entrega, raw_row_num: l.raw_row_num, raw_json: clean(l),
    }))
    for (let i = 0; i < rows.length; i += 500) {
      await sb.from('escala_linhas').insert(rows.slice(i, i + 500))
    }
    console.log(`  ✓ ${e.tipo}: ${linhas.length} linhas`)
  }

  // Unitrac PDF
  const pdfPath = `${BASE}/relatorio_9589 (1).pdf`
  if (!existsSync(pdfPath)) { console.log('PDF Unitrac não encontrado'); return }
  const exUn = await sb.from('unitrac_uploads').select('id').eq('data_relatorio', DATA)
  if (exUn.data?.length) {
    await sb.from('unitrac_paradas').delete().in('unitrac_upload_id', exUn.data.map(u => u.id))
    await sb.from('unitrac_uploads').delete().in('id', exUn.data.map(u => u.id))
  }
  const veiculos = await parseUnitracPdf(readFileSync(pdfPath), null)
  const comParadas = veiculos.filter(v => v.paradas.length > 0)
  const paradas = comParadas.flatMap(v => v.paradas.map(p => ({
    placa_norm: san(p.placa_norm), chegada: p.chegada.toISOString(), saida: p.saida?.toISOString() ?? null,
    duracao_seg: p.duracao_seg, distancia_km: p.distancia_km, endereco: san(p.endereco),
    lat: p.lat, lng: p.lng, local_parada: san(p.local_parada), codigo_loja: san(p.codigo_loja),
    nome_loja: san(p.nome_loja), classificacao: p.classificacao, ordem: p.ordem,
  })))
  const { data: up } = await sb.from('unitrac_uploads').insert({
    data_relatorio: DATA, arquivo_path: pdfPath, qtd_abas: comParadas.length, qtd_paradas: paradas.length,
    status: 'processado', uploaded_by: FAKE_USER, processado_em: new Date().toISOString(),
  }).select('id').single()
  if (!up) { console.log('Erro upload unitrac'); return }
  const paradaRows = paradas.map(p => ({ ...p, unitrac_upload_id: up.id }))
  for (let i = 0; i < paradaRows.length; i += 500) {
    await sb.from('unitrac_paradas').insert(paradaRows.slice(i, i + 500))
  }
  console.log(`  ✓ Unitrac: ${comParadas.length} veículos / ${paradas.length} paradas`)
})().catch(e => { console.error(e); process.exit(1) })
