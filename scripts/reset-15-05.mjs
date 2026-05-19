// Limpa o dia 2026-05-15 e re-processa os arquivos do Downloads.
import 'dotenv/config'
import { config as dotenvConfig } from 'dotenv'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { parseEscalaGeral } from '../src/lib/parsers/escala-geral.ts'
import { parseEscalaZonaSul } from '../src/lib/parsers/escala-zona-sul.ts'
import { parseEscalaPax } from '../src/lib/parsers/escala-pax.ts'
import { parseEscalaArmazemGrao } from '../src/lib/parsers/escala-armazem-grao.ts'
import { parseEscalaGuanabaraPdf } from '../src/lib/parsers/escala-guanabara-pdf.ts'
import { parseUnitracPdf } from '../src/lib/parsers/unitrac-pdf.ts'

dotenvConfig({ path: resolve(process.cwd(), '.env.local') })

const data = '2026-05-15'
const DOWNLOADS = 'C:/Users/media/Downloads'

const files = {
  GERAL:        `${DOWNLOADS}/ESCALA GERAL DE MAIO 1 (1).xlsx`,
  ZONA_SUL:     `${DOWNLOADS}/ESCALA ZONA SUL - MAIO (1).xlsx`,
  PAX:          `${DOWNLOADS}/ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (1).xlsx`,
  ARMAZEM_GRAO: `${DOWNLOADS}/ESCALA DO ARMAZÉM DO GRÃO MAIO (2).xlsx`,
  GUANABARA:    `${DOWNLOADS}/ESCALA 14.05 (1).pdf`,
  UNITRAC:      `${DOWNLOADS}/relatorio_9206.pdf`,
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

console.log(`\n=== Limpando ${data} ===`)
await sb.from('anomalias').delete().eq('data', data)
await sb.from('kpi_rotas').delete().eq('data', data)
await sb.from('kpis').delete().eq('data', data)
const { data: ups } = await sb.from('unitrac_uploads').select('id').eq('data_relatorio', data)
if (ups?.length) await sb.from('unitrac_paradas').delete().in('unitrac_upload_id', ups.map(u => u.id))
await sb.from('unitrac_uploads').delete().eq('data_relatorio', data)
const { data: eups } = await sb.from('escala_uploads').select('id').eq('data_escala', data)
if (eups?.length) await sb.from('escala_linhas').delete().in('escala_upload_id', eups.map(u => u.id))
await sb.from('escala_uploads').delete().eq('data_escala', data)
console.log('  ✓ banco zerado pro dia 15')

console.log(`\n=== Re-processando escalas ===`)
const escalas = [
  { tipo: 'GERAL',        file: files.GERAL,        parser: parseEscalaGeral,        kind: 'xlsx' },
  { tipo: 'ZONA_SUL',     file: files.ZONA_SUL,     parser: parseEscalaZonaSul,      kind: 'xlsx' },
  { tipo: 'PAX',          file: files.PAX,          parser: parseEscalaPax,          kind: 'xlsx' },
  { tipo: 'ARMAZEM_GRAO', file: files.ARMAZEM_GRAO, parser: parseEscalaArmazemGrao,  kind: 'xlsx' },
  { tipo: 'GUANABARA',    file: files.GUANABARA,    parser: parseEscalaGuanabaraPdf, kind: 'pdf' },
]

const summary = []
for (const e of escalas) {
  const buf = await readFile(e.file)
  let linhas = []
  try {
    linhas = await e.parser(e.kind === 'pdf' ? buf : buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), data)
  } catch (err) {
    console.log(`  ${e.tipo.padEnd(14)}: ERRO no parse → ${err.message}`)
    summary.push({ tipo: e.tipo, linhas: 0, erro: err.message })
    continue
  }
  console.log(`  ${e.tipo.padEnd(14)}: ${linhas.length} linhas parseadas`)
  if (linhas.length === 0) {
    summary.push({ tipo: e.tipo, linhas: 0, motivo: 'arquivo sem dados pra essa data' })
    continue
  }
  const { data: up, error: upErr } = await sb.from('escala_uploads').insert({
    data_escala: data,
    tipo: e.tipo,
    arquivo_path: e.file,
    nome_arquivo: e.file.split('/').pop(),
    qtd_linhas: linhas.length,
    status: 'processado',
    processado_em: new Date().toISOString(),
  }).select('id').single()
  if (upErr) { console.log(`    ✗ insert upload: ${upErr.message}`); continue }
  const rows = linhas.map(l => ({
    escala_upload_id: up.id,
    rede_id: l.rede_id,
    loja_nome_raw: l.loja_nome_raw,
    loja_codigo_raw: l.loja_codigo_raw,
    placa_norm: l.placa_norm || null,
    placa_raw: l.placa_raw,
    motorista_nome: l.motorista_nome,
    motorista_codigo: l.motorista_codigo,
    tipo_carro: l.tipo_carro,
    turno: l.turno,
    carro_ordem: l.carro_ordem,
    obs: l.obs,
    restricao: l.restricao,
    peso_kg: l.peso_kg,
    paletes: l.paletes,
    data_entrega: l.data_entrega,
    raw_row_num: l.raw_row_num,
    raw_json: l,
  }))
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100)
    const { error } = await sb.from('escala_linhas').insert(batch)
    if (error) { console.log(`    ✗ insert linhas: ${error.message}`); break }
  }
  console.log(`    ✓ inserido (upload_id=${up.id})`)
  summary.push({ tipo: e.tipo, linhas: linhas.length })
}

console.log(`\n=== Re-processando Unitrac ===`)
try {
  const buf = await readFile(files.UNITRAC)
  const veiculos = await parseUnitracPdf(buf)
  const totalParadas = veiculos.reduce((s, v) => s + v.paradas.length, 0)
  console.log(`  Unitrac: ${veiculos.length} veículos, ${totalParadas} paradas`)
  if (veiculos.length > 0) {
    const { data: uup, error: uupErr } = await sb.from('unitrac_uploads').insert({
      data_relatorio: data,
      arquivo_path: files.UNITRAC,
      qtd_abas: veiculos.length,
      qtd_paradas: totalParadas,
      status: 'processado',
    }).select('id').single()
    if (uupErr) throw new Error(uupErr.message)
    const clean = s => typeof s === 'string' ? s.replace(/ /g, '').replace(/[--]/g, '') : s
    const paradaRows = []
    for (const v of veiculos) {
      for (const p of v.paradas) {
        paradaRows.push({
          unitrac_upload_id: uup.id,
          placa_norm: v.placa_norm,
          chegada: p.chegada.toISOString(),
          saida: p.saida?.toISOString() ?? null,
          duracao_seg: p.duracao_seg,
          distancia_km: p.distancia_km,
          endereco: clean(p.endereco),
          lat: p.lat,
          lng: p.lng,
          local_parada: clean(p.local_parada),
          codigo_loja: clean(p.codigo_loja),
          nome_loja: clean(p.nome_loja),
          classificacao: p.classificacao,
          ordem: p.ordem,
        })
      }
    }
    for (let i = 0; i < paradaRows.length; i += 500) {
      const batch = paradaRows.slice(i, i + 500)
      const { error } = await sb.from('unitrac_paradas').insert(batch)
      if (error) throw new Error(`paradas batch ${i}: ${error.message}`)
    }
    console.log(`    ✓ inserido (upload_id=${uup.id})`)
  }
} catch (err) {
  console.log(`  Unitrac ERRO: ${err.message}`)
}

console.log(`\n=== FINAL ===`)
for (const s of summary) {
  console.log(`  ${s.tipo.padEnd(14)}: ${s.linhas} linhas ${s.erro ? '(' + s.erro + ')' : s.motivo ? '(' + s.motivo + ')' : ''}`)
}
console.log('\n✓ Banco recarregado. Recarrega a página /painel/kpi/dia?data=2026-05-15.')
