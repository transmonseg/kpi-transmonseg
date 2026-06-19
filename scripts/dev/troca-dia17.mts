// Roda o matcher de PRODUÇÃO no dia 17/06 e reporta, caso a caso, se o sistema
// atribuiu sozinho a placa substituta (lógica T18 plate-swap) ou não.
// Fonte da escala: escala_linhas (DB, exatamente o que produção usou); fallback
// para os arquivos em Downloads. Paradas: relatorio_10431.pdf (= 17/06).
import { readFile } from 'node:fs/promises'
import { config } from 'dotenv'; config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { parseEscalaArquivo } from '@/lib/parsers/escala-arquivo'
import { cruzaEscalaUnitrac, setSemGeo, variantesPlaca, type EscalaLinhaRow, type UnitracParadaRow } from '@/lib/kpi/matcher'
import { REDE_NOMES_CANONICOS } from '@/lib/kpi/kpi-styles'

const DL = 'C:/Users/media/Downloads'
const PDF = `${DL}/relatorio_10431.pdf`
const DATA = '2026-06-17'
const FLAG = ['UBO5E05', 'UEH9I93', 'LGT1200', 'GVH1397'] // placas da ESCALA (4 casos)
const hhmm = (iso: string) => { const d = new Date(iso); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}` }

const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

// ── 1) Escala do dia 17 — DB primeiro, fallback arquivos ──────────────────────
let escalaLinhas: any[] = []
const { data: ups } = await svc.from('escala_uploads').select('id, arquivo_nome').eq('data_escala', DATA)
if (ups?.length) {
  const ids = ups.map((u: any) => u.id)
  const { data: rows } = await svc.from('escala_linhas')
    .select('id, rede_id, loja_nome_raw, loja_codigo_raw, placa_norm, motorista_nome, carro_ordem, data_entrega')
    .in('escala_upload_id', ids)
  escalaLinhas = rows ?? []
  console.log(`Escala (DB): ${ups.length} uploads, ${escalaLinhas.length} linhas`)
} else {
  console.log('Escala (DB): nada no 17/06, usando arquivos de Downloads')
  const arqs = ['ESCALA 17.06 (1).pdf', 'ESCALA ZONA SUL - JUNHO (2).xlsx', 'ESCALA GERAL DE JUNHO (6).xlsx']
  let i = 0
  for (const arq of arqs) {
    try {
      const ls = await parseEscalaArquivo(await readFile(`${DL}/${arq}`), arq, DATA)
      escalaLinhas.push(...ls.map((l: any) => ({ id: `esc-${i++}`, rede_id: l.rede_id, loja_nome_raw: l.loja_nome_raw, loja_codigo_raw: l.loja_codigo_raw, placa_norm: l.placa_norm || null, motorista_nome: l.motorista_nome, carro_ordem: l.carro_ordem, data_entrega: l.data_entrega })))
    } catch { /* ignora */ }
  }
  // dedup por (rede, placa, loja, ordem) — 3 arquivos se sobrepõem
  const vistos = new Set<string>()
  escalaLinhas = escalaLinhas.filter((l) => {
    const k = `${l.rede_id}|${l.placa_norm ?? ''}|${(l.loja_codigo_raw ?? '')}|${(l.loja_nome_raw ?? '').toLowerCase()}|${l.carro_ordem ?? ''}`
    if (vistos.has(k)) return false
    vistos.add(k); return true
  })
  console.log(`Escala (arquivos): ${escalaLinhas.length} linhas (após dedup)`)
}
// Mostra qual loja cada placa-alvo recebeu na escala
for (const f of FLAG) {
  const ls = escalaLinhas.filter((l) => l.placa_norm === f)
  for (const l of ls) console.log(`   escala ${f}: rede=${l.rede_id} loja="${l.loja_nome_raw}" cod=${l.loja_codigo_raw ?? '—'}`)
}

const escalaRows: EscalaLinhaRow[] = escalaLinhas.map((l) => ({
  id: String(l.id), rede_id: l.rede_id, placa_norm: l.placa_norm || null,
  loja_nome_raw: l.loja_nome_raw, loja_codigo_raw: l.loja_codigo_raw,
  motorista_nome: l.motorista_nome, carro_ordem: l.carro_ordem, data_entrega: l.data_entrega,
})) as any
const escMap = new Map(escalaRows.map((e) => [e.id, e]))

// ── 2) Cadastro (lojas, geo, frota) ───────────────────────────────────────────
const [lojasRes, canonRes, veicRes] = await Promise.all([
  svc.from('lojas').select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros, endereco, bairro, municipio, numero').eq('ativo', true),
  svc.from('canonical_loja').select('id, name, lat, lng, raio_metros').not('lat', 'is', null).not('lng', 'is', null),
  svc.from('veiculos').select('placa_norm').eq('ativo', true),
])
const lojas = (lojasRes.data ?? []).map((l: any) => ({ ...l, raio_metros: l.raio_metros ?? 150 })) as any
const geoStores = (canonRes.data ?? []).map((c: any) => ({ id: c.id, name: c.name, lat: c.lat, lng: c.lng, raio_metros: c.raio_metros ?? 150 })) as any
const cadastroPlacas = new Set<string>()
for (const e of escalaRows) if (e.placa_norm) cadastroPlacas.add(e.placa_norm)
for (const v of veicRes.data ?? []) if (v.placa_norm) cadastroPlacas.add(String(v.placa_norm))
console.log(`Cadastro: ${lojas.length} lojas, ${geoStores.length} geo, ${cadastroPlacas.size} placas\n`)

// ── 3) Paradas do PDF ─────────────────────────────────────────────────────────
const veic = await parseUnitracPdf(await readFile(PDF), cadastroPlacas)
const paradaRows: UnitracParadaRow[] = veic.flatMap((v, vi) =>
  v.paradas.map((p: any, pi: number) => ({
    id: `par-${vi}-${pi}`, placa_norm: p.placa_norm, chegada: p.chegada.toISOString(), saida: p.saida.toISOString(),
    duracao_seg: p.duracao_seg, local_parada: p.local_parada, codigo_loja: p.codigo_loja, nome_loja: p.nome_loja,
    lat: p.lat, lng: p.lng, endereco: p.endereco, classificacao: p.classificacao, ordem: p.ordem,
  })),
) as any
console.log(`PDF: ${veic.length} veículos, ${paradaRows.length} paradas\n`)

// ── 4) Matcher de produção (PDF+API definitivo): setSemGeo + svc + geoStores ───
setSemGeo(true)
const rotas = await cruzaEscalaUnitrac(escalaRows, paradaRows, lojas, svc, geoStores, { geoEndereco: true })

// ── 5) Caso a caso pras 4 placas da escala ────────────────────────────────────
const rede = (id: string) => REDE_NOMES_CANONICOS[id] ?? id
console.log('═'.repeat(78))
for (const f of FLAG) {
  const vars = new Set([f, ...variantesPlaca(f)])
  const rota: any = rotas.find((r: any) => vars.has(r.placa_norm ?? ''))
  console.log(`\n### ${f}  (variantes: ${variantesPlaca(f).join(',') || '—'})`)
  if (!rota) { console.log('  Nenhuma rota com essa placa de escala.'); continue }
  const esc: any = escMap.get(rota.escala_linha_id)
  const meta = rota._matchMeta ?? {}
  const substituta = rota.placa_real && rota.placa_real !== rota.placa_norm ? rota.placa_real : null
  console.log(`  rede=${rede(rota.rede_id)}  loja="${esc?.loja_nome_raw ?? '?'}" cod=${esc?.loja_codigo_raw ?? '—'}`)
  console.log(`  placa_norm(escala)=${rota.placa_norm}  placa_real=${rota.placa_real ?? '—'}  placa_unitrac=${rota.placa_unitrac ?? '—'}`)
  console.log(`  algorithm=${meta.algorithm ?? '—'}  confidence=${meta.confidence ?? '—'}`)
  console.log(`  >>> SUBSTITUTA AUTO-DETECTADA: ${substituta ? `SIM → ${substituta}` : 'NÃO'}`)
  const sug = rota.placa_sugerida ? `${rota.placa_sugerida} (${rota.sugestao_confianca}${rota.sugestao_hora ? ` ${rota.sugestao_hora}` : ''})` : 'NÃO'
  console.log(`  >>> SUGESTÃO (T18 segurou): ${sug}`)
  const ps = rota.paradas ?? []
  console.log(`  paradas da rota (${ps.length}):`)
  for (const p of ps.slice(0, 12))
    console.log(`     ${hhmm(p.chegada)}-${hhmm(p.saida)} ${String(p.classificacao).padEnd(10)} placa=${p.placa_norm ?? '—'} loja=${p.loja_id ? 'sim' : '—'} "${String(p.nome_loja ?? p.local_parada ?? '').slice(0, 40)}"`)
}
console.log('\n' + '═'.repeat(78))
process.exit(0)
