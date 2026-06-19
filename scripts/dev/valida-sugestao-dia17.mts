// Valida o modo sugestão de troca na escala REAL do dia 17 (arquivos Downloads,
// que têm a escala completa) + paradas reais do relatorio_10431.pdf. Conta e
// lista as sugestões ALTA/BAIXA produzidas pelo matcher de produção.
import { readFile } from 'node:fs/promises'
import { config } from 'dotenv'; config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { parseEscalaArquivo } from '@/lib/parsers/escala-arquivo'
import { cruzaEscalaUnitrac, setSemGeo, type EscalaLinhaRow, type UnitracParadaRow } from '@/lib/kpi/matcher'
import { REDE_NOMES_CANONICOS } from '@/lib/kpi/kpi-styles'

const DL = 'C:/Users/media/Downloads'
const PDF = `${DL}/relatorio_10431.pdf`
const DATA = '2026-06-17'
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

// ── Escala completa dos arquivos ──────────────────────────────────────────────
const arqs = ['ESCALA 17.06 (1).pdf', 'ESCALA ZONA SUL - JUNHO (2).xlsx', 'ESCALA GERAL DE JUNHO (6).xlsx']
let escalaLinhas: any[] = []
let i = 0
for (const arq of arqs) {
  try {
    const ls = await parseEscalaArquivo(await readFile(`${DL}/${arq}`), arq, DATA)
    escalaLinhas.push(...ls.map((l: any) => ({ id: `esc-${i++}`, rede_id: l.rede_id, loja_nome_raw: l.loja_nome_raw, loja_codigo_raw: l.loja_codigo_raw, placa_norm: l.placa_norm || null, motorista_nome: l.motorista_nome, carro_ordem: l.carro_ordem, data_entrega: l.data_entrega })))
  } catch (e: any) { console.log(`(ignora ${arq}: ${e?.message})`) }
}
const vistos = new Set<string>()
escalaLinhas = escalaLinhas.filter((l) => {
  const k = `${l.rede_id}|${l.placa_norm ?? ''}|${(l.loja_codigo_raw ?? '')}|${(l.loja_nome_raw ?? '').toLowerCase()}|${l.carro_ordem ?? ''}`
  if (vistos.has(k)) return false; vistos.add(k); return true
})
console.log(`Escala (arquivos): ${escalaLinhas.length} linhas`)
const escalaRows: EscalaLinhaRow[] = escalaLinhas.map((l) => ({
  id: String(l.id), rede_id: l.rede_id, placa_norm: l.placa_norm || null,
  loja_nome_raw: l.loja_nome_raw, loja_codigo_raw: l.loja_codigo_raw,
  motorista_nome: l.motorista_nome, carro_ordem: l.carro_ordem, data_entrega: l.data_entrega,
})) as any
const escMap = new Map(escalaRows.map((e) => [e.id, e]))

// ── Cadastro ──────────────────────────────────────────────────────────────────
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

// ── Paradas do PDF ─────────────────────────────────────────────────────────────
const veic = await parseUnitracPdf(await readFile(PDF), cadastroPlacas)
const paradaRows: UnitracParadaRow[] = veic.flatMap((v, vi) =>
  v.paradas.map((p: any, pi: number) => ({
    id: `par-${vi}-${pi}`, placa_norm: p.placa_norm, chegada: p.chegada.toISOString(), saida: p.saida.toISOString(),
    duracao_seg: p.duracao_seg, local_parada: p.local_parada, codigo_loja: p.codigo_loja, nome_loja: p.nome_loja,
    lat: p.lat, lng: p.lng, endereco: p.endereco, classificacao: p.classificacao, ordem: p.ordem,
  })),
) as any
console.log(`PDF: ${veic.length} veículos, ${paradaRows.length} paradas\n`)

// ── Matcher de produção ─────────────────────────────────────────────────────────
setSemGeo(true)
const rotas = await cruzaEscalaUnitrac(escalaRows, paradaRows, lojas, svc, geoStores, { geoEndereco: true })

// ── Agrega sugestões ────────────────────────────────────────────────────────────
const rede = (id: string) => REDE_NOMES_CANONICOS[id] ?? id
const sugs = rotas.filter((r: any) => r.placa_sugerida)
const alta = sugs.filter((r: any) => r.sugestao_confianca === 'alta')
const baixa = sugs.filter((r: any) => r.sugestao_confianca === 'baixa')
console.log('═'.repeat(78))
console.log(`SUGESTÕES: ${sugs.length} total — ${alta.length} ALTA, ${baixa.length} BAIXA  (de ${rotas.length} rotas)\n`)

const linha = (r: any) => {
  const esc: any = escMap.get(r.escala_linha_id)
  return `  [${rede(r.rede_id)}] "${(esc?.loja_nome_raw ?? '?').slice(0, 38)}"  escala=${r.placa_norm}  →  ${r.placa_sugerida}${r.sugestao_hora ? ` (${r.sugestao_hora})` : ''}`
}
console.log(`── ALTA (${alta.length}) ${'─'.repeat(40)}`)
for (const r of alta.slice(0, 25)) console.log(linha(r))
console.log(`\n── BAIXA (primeiras 15 de ${baixa.length}) ${'─'.repeat(28)}`)
for (const r of baixa.slice(0, 15)) console.log(linha(r))

console.log(`\n── ALVOS DA AUDITORIA ${'─'.repeat(40)}`)
for (const f of ['UBO5E05', 'UEH9I93', 'LGT1200', 'GVH1397']) {
  const rs = rotas.filter((r: any) => r.placa_norm === f)
  if (!rs.length) { console.log(`  ${f}: sem rota`); continue }
  for (const r of rs as any[]) {
    const esc: any = escMap.get(r.escala_linha_id)
    const sug = r.placa_sugerida ? `${r.placa_sugerida} (${r.sugestao_confianca}${r.sugestao_hora ? ` ${r.sugestao_hora}` : ''})` : 'NENHUMA'
    console.log(`  ${f}  "${(esc?.loja_nome_raw ?? '?').slice(0,34)}"  matched=${r.paradas?.length ? 'SIM' : 'não'}  sugestão=${sug}`)
  }
}
console.log('\n' + '═'.repeat(78))
process.exit(0)
