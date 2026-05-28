/**
 * Lista TODAS as lojas (por código) com CADASTRO CERTO no Unitrac.
 *
 * Critérios pra ser CERTO (todos têm que bater):
 * 1. Cod_loja existe no cadastro do banco (tabela lojas)
 * 2. GPS médio do Unitrac está DENTRO do raio_metros do cadastro
 * 3. GPS spread ≤ 1km (paradas concentradas, não geofence gigante)
 * 4. NÃO está na região da BASE Benassi (≥ 2km do ponto da base)
 * 5. NÃO está em cluster cross-rede (≤100m de outro cod_loja de rede diferente)
 *
 * Para essas lojas o sistema pode gerar KPI confiável; pras outras, esperar
 * correção do cadastro no Unitrac (Benassi).
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFileSync, writeFileSync } from 'fs'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const PDFS = [
  ['19', 'docs/conversas-tia-erica/dia-19/unitrac/relatorio_9572.pdf'],
  ['20', 'docs/conversas-tia-erica/dia-20/unitrac/relatorio_9522.pdf'],
  ['25', 'docs/conversas-tia-erica/dia-25/unitrac/relatorio_9652.pdf'],
] as const

const BASE_LAT = -22.828, BASE_LNG = -43.339, BASE_RAIO_KM = 2

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const f1 = lat1 * Math.PI / 180, f2 = lat2 * Math.PI / 180
  const df = (lat2 - lat1) * Math.PI / 180, dl = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(df/2)**2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl/2)**2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

;(async () => {
  // Carrega cadastros
  const { data: lojasDB } = await sb.from('lojas').select('rede_id, nome, codigo_unitrac, lat, lng, raio_metros, ativo').not('codigo_unitrac', 'is', null)
  const cad = new Map<string, { rede_id: string; nome: string; lat: number | null; lng: number | null; raio: number; ativo: boolean }>()
  for (const l of lojasDB ?? []) {
    cad.set(l.codigo_unitrac as string, { rede_id: l.rede_id as string, nome: l.nome as string, lat: l.lat as number | null, lng: l.lng as number | null, raio: (l.raio_metros as number) ?? 200, ativo: l.ativo as boolean })
  }

  // Coleta paradas LOJA dos 3 dias
  type Pt = { cod: string; nome: string; lat: number; lng: number; placa: string; dia: string }
  const pts: Pt[] = []
  for (const [dia, pdf] of PDFS) {
    const veiculos = await parseUnitracPdf(readFileSync(pdf), null)
    for (const v of veiculos) {
      for (const p of v.paradas) {
        if (p.classificacao !== 'LOJA') continue
        if (!p.codigo_loja || p.lat == null || p.lng == null) continue
        pts.push({ cod: p.codigo_loja, nome: (p.nome_loja ?? '').replace(/\s+/g, ' ').trim(), lat: p.lat, lng: p.lng, placa: v.placa_norm, dia })
      }
    }
  }

  // Agrupa por cod
  type Info = { cod: string; nomes: Set<string>; lats: number[]; lngs: number[]; placas: Set<string>; dias: Set<string> }
  const byCod = new Map<string, Info>()
  for (const p of pts) {
    const x = byCod.get(p.cod) ?? { cod: p.cod, nomes: new Set(), lats: [], lngs: [], placas: new Set(), dias: new Set() }
    x.nomes.add(p.nome); x.lats.push(p.lat); x.lngs.push(p.lng); x.placas.add(p.placa); x.dias.add(p.dia)
    byCod.set(p.cod, x)
  }

  // Calcula stats por cod (mediana lat/lng + spread máx)
  type Stat = { cod: string; nome: string; rede: string; latMed: number; lngMed: number; spread: number; placas: number; dias: number }
  const stats = new Map<string, Stat>()
  for (const [cod, info] of byCod) {
    const lats = [...info.lats].sort((a, b) => a - b)
    const lngs = [...info.lngs].sort((a, b) => a - b)
    const latMed = lats[Math.floor(lats.length / 2)]
    const lngMed = lngs[Math.floor(lngs.length / 2)]
    let spread = 0
    for (let i = 0; i < info.lats.length; i++) {
      const d = haversine(info.lats[i], info.lngs[i], latMed, lngMed)
      if (d > spread) spread = d
    }
    const c = cad.get(cod)
    stats.set(cod, { cod, nome: [...info.nomes][0] ?? '?', rede: c?.rede_id ?? '?', latMed, lngMed, spread, placas: info.placas.size, dias: info.dias.size })
  }

  // Identifica clusters cross-rede (≤100m, redes diferentes)
  const codsClusterizados = new Set<string>()
  const codsArr = [...stats.keys()]
  for (let i = 0; i < codsArr.length; i++) {
    for (let j = i + 1; j < codsArr.length; j++) {
      const a = stats.get(codsArr[i])!, b = stats.get(codsArr[j])!
      if (a.rede === b.rede) continue
      if (haversine(a.latMed, a.lngMed, b.latMed, b.lngMed) <= 100) {
        codsClusterizados.add(a.cod); codsClusterizados.add(b.cod)
      }
    }
  }

  // Classifica cada cod
  type Status = 'CERTO' | 'GEOFENCE_GIGANTE' | 'CLUSTER_CROSS_REDE' | 'NA_BASE' | 'CADASTRO_DIVERGENTE' | 'NAO_CADASTRADO'
  type Result = Stat & { status: Status; reason: string; cad_lat?: number | null; cad_lng?: number | null; dist_cad?: number }
  const results: Result[] = []
  for (const s of stats.values()) {
    const c = cad.get(s.cod)
    if (!c) { results.push({ ...s, status: 'NAO_CADASTRADO', reason: 'cod não existe no banco' }); continue }
    if (c.lat == null || c.lng == null) { results.push({ ...s, status: 'CADASTRO_DIVERGENTE', reason: 'cadastro sem lat/lng' }); continue }
    const distCad = haversine(s.latMed, s.lngMed, c.lat, c.lng)
    const naBase = haversine(s.latMed, s.lngMed, BASE_LAT, BASE_LNG) < BASE_RAIO_KM * 1000
    const cluster = codsClusterizados.has(s.cod)
    const out: Result = { ...s, status: 'CERTO', reason: '', cad_lat: c.lat, cad_lng: c.lng, dist_cad: Math.round(distCad) }
    if (naBase) { out.status = 'NA_BASE'; out.reason = `GPS médio a ${Math.round(haversine(s.latMed, s.lngMed, BASE_LAT, BASE_LNG))}m da BASE` }
    else if (cluster) { out.status = 'CLUSTER_CROSS_REDE'; out.reason = 'mesma coord de outro cod de rede diferente' }
    else if (s.spread > 1000) { out.status = 'GEOFENCE_GIGANTE'; out.reason = `spread GPS ${Math.round(s.spread/1000)}km` }
    else if (distCad > c.raio) { out.status = 'CADASTRO_DIVERGENTE'; out.reason = `GPS ${Math.round(distCad)}m do cadastro (raio ${c.raio}m)` }
    results.push(out)
  }

  // Agrupa CERTOS por rede
  const certos = results.filter(r => r.status === 'CERTO')
  const porRede = new Map<string, Result[]>()
  for (const r of certos) {
    const arr = porRede.get(r.rede) ?? []
    arr.push(r); porRede.set(r.rede, arr)
  }

  // Total de cods do banco por rede pra comparar
  const totalRede = new Map<string, number>()
  for (const l of lojasDB ?? []) {
    totalRede.set(l.rede_id as string, (totalRede.get(l.rede_id as string) ?? 0) + 1)
  }

  // Relatório
  const out: string[] = [
    '# Lojas com CADASTRO CERTO no Unitrac (sistema pode gerar KPI)',
    '',
    `Análise dos 3 dias (19/20/25) — ${certos.length} lojas validadas como cadastro certo (de ${results.length} cods únicos vistos no Unitrac).`,
    '',
    'Critérios: cadastrado no banco + GPS dentro do raio + spread ≤ 1km + fora da BASE + não em cluster cross-rede.',
    '',
    '## Sumário por rede',
    '',
    '| Rede | Lojas certas (Unitrac) | Lojas no banco | % cobertura |',
    '|------|------------------------|----------------|-------------|',
  ]
  const redesOrd = [...porRede.entries()].sort((a, b) => b[1].length - a[1].length)
  for (const [rede, lojas] of redesOrd) {
    const total = totalRede.get(rede) ?? 0
    const pct = total > 0 ? Math.round(100 * lojas.length / total) : 0
    out.push(`| ${rede} | ${lojas.length} | ${total} | ${pct}% |`)
  }
  out.push('')

  out.push('## Lojas certas detalhadas (agrupadas por rede)')
  out.push('')
  for (const [rede, lojas] of redesOrd) {
    out.push(`### ${rede} (${lojas.length} lojas certas)`)
    out.push('')
    out.push('| cod_unitrac | Nome | Placas | Dias | dist cad |')
    out.push('|-------------|------|--------|------|----------|')
    for (const l of lojas.sort((a, b) => b.placas - a.placas)) {
      out.push(`| \`${l.cod}\` | ${l.nome.slice(0, 50)} | ${l.placas} | ${l.dias} | ${l.dist_cad}m |`)
    }
    out.push('')
  }

  // Tabela problemáticas
  out.push('## Lojas problemáticas (NÃO usar pro KPI automático)')
  out.push('')
  const probl = results.filter(r => r.status !== 'CERTO')
  const porStatus = new Map<Status, Result[]>()
  for (const r of probl) {
    const arr = porStatus.get(r.status) ?? []
    arr.push(r); porStatus.set(r.status, arr)
  }
  for (const [status, lojas] of porStatus) {
    out.push(`### ${status} (${lojas.length})`)
    out.push('')
    for (const l of lojas.sort((a, b) => b.placas - a.placas)) {
      out.push(`- \`${l.cod}\` **[${l.rede}]** ${l.nome.slice(0, 50)} — ${l.reason}`)
    }
    out.push('')
  }

  writeFileSync('docs/conversas-tia-erica/LOJAS-CADASTRO-CERTO.md', out.join('\n'))
  console.log(`OK → docs/conversas-tia-erica/LOJAS-CADASTRO-CERTO.md`)
  console.log(`CERTOS: ${certos.length}/${results.length} (${Math.round(100 * certos.length / results.length)}%)`)
  for (const [rede, lojas] of redesOrd) {
    const total = totalRede.get(rede) ?? 0
    console.log(`  ${rede.padEnd(18)} ${lojas.length}/${total}`)
  }
})().catch(e => { console.error(e); process.exit(1) })
