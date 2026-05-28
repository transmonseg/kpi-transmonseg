/**
 * Pra cada ESCALA (por rede), lista todas as lojas únicas que apareceram
 * na escala dos 3 dias e marca status no Unitrac:
 *   CERTO         — apareceu como LOJA com cod cadastrado e GPS bate
 *   ERRADO_BASE   — apareceu mas GPS fica em cima da BASE (cadastro errado)
 *   ERRADO_LONGE  — apareceu mas GPS muito distante do cadastro
 *   SOBREPOSTO    — em cluster cross-rede ou geofence gigante
 *   SEM_PARADA    — placa escalada não fez parada LOJA com esse cod
 *   SEM_CADASTRO  — loja na escala mas sem cadastro no banco (precisa criar)
 *   SEM_RASTRE    — placa escalada não tem nada no Unitrac
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { writeFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const BASE_LAT = -22.828, BASE_LNG = -43.339

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const f1 = lat1 * Math.PI / 180, f2 = lat2 * Math.PI / 180
  const df = (lat2 - lat1) * Math.PI / 180, dl = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(df/2)**2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl/2)**2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

function normaliza(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
}

// Extrai tokens significativos (≥3 chars, sem stopwords típicas)
const STOPWORDS = new Set(['LOJA', 'FILIAL', 'SUPERMERCADO', 'MERCADO', 'SUPER', 'PREZUNIC', 'ASSAI', 'SENDAS', 'CARREFOUR', 'PRINCESA', 'GUANABARA', 'SUPERPRIX', 'ATACADAO', 'PAX', 'FEIRA', 'NOVA', 'ARMAZEM', 'VIANENSE', 'MUNDIAL', 'GRAO', 'ZONA', 'SUL', 'EMANUEL', 'SAMS', 'CLUB', 'PRX', 'CAB', 'PETROPOLIS', 'GB', 'SPID', 'AS', 'DO', 'DA', 'DE'])
function tokens(s: string): Set<string> {
  return new Set(normaliza(s).split(/[^A-Z0-9]+/).filter(t => t.length >= 3 && !STOPWORDS.has(t)))
}

// Score 0..1 de match entre dois nomes (fuzzy por tokens)
function scoreNome(a: string, b: string): number {
  const ta = tokens(a), tb = tokens(b)
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const x of ta) if (tb.has(x)) inter++
  return inter / Math.min(ta.size, tb.size)
}

// Redes fungíveis (lojas físicas compartilhadas)
const REDES_FUNGIVEIS: Record<string, string[]> = {
  ASSAI: ['ASSAI', 'SENDAS'],
  SENDAS: ['SENDAS', 'ASSAI'],
  SUPER_PAX: ['SUPER_PAX', 'PAX'],
}

;(async () => {
  // 1) Carrega escalas dos 3 dias (loja_nome_raw + placa + rede)
  const { data: esc } = await sb.from('escala_linhas')
    .select('rede_id, loja_nome_raw, placa_norm, data_entrega')
    .in('data_entrega', ['2026-05-19', '2026-05-20', '2026-05-25'])

  // 2) Carrega cadastros
  const { data: lojasDB } = await sb.from('lojas').select('rede_id, nome, codigo_unitrac, lat, lng, raio_metros, ativo')

  // Index cadastros por rede
  const cadByRede = new Map<string, any[]>()
  const cadByCod = new Map<string, any>()
  for (const l of lojasDB ?? []) {
    if (l.codigo_unitrac) cadByCod.set(l.codigo_unitrac as string, l)
    const arr = cadByRede.get(l.rede_id as string) ?? []
    arr.push(l); cadByRede.set(l.rede_id as string, arr)
  }

  // Busca cadastro: tenta nome exato, depois fuzzy >=0.6, depois fuzzy nas fungíveis
  function findCad(rede: string, nomeEscala: string): any {
    const redes = REDES_FUNGIVEIS[rede] ?? [rede]
    let bestScore = 0, bestCad: any = null
    for (const r of redes) {
      const candidatos = cadByRede.get(r) ?? []
      for (const c of candidatos) {
        if (!c.nome) continue
        // Exact match (depois de normalizar)
        if (normaliza(c.nome) === normaliza(nomeEscala)) return c
        // Match por nome_unitrac também
        if (c.nome_unitrac && normaliza(c.nome_unitrac) === normaliza(nomeEscala)) return c
        // Fuzzy: score tokens
        const s1 = scoreNome(nomeEscala, c.nome)
        const s2 = c.nome_unitrac ? scoreNome(nomeEscala, c.nome_unitrac) : 0
        const s = Math.max(s1, s2)
        if (s >= 0.6 && s > bestScore) { bestScore = s; bestCad = c }
      }
    }
    return bestCad
  }

  // 3) Carrega paradas Unitrac dos 3 dias COM paginação
  const paradas: any[] = []
  let offset = 0
  while (true) {
    const { data: page } = await sb.from('unitrac_paradas')
      .select('placa_norm, codigo_loja, nome_loja, lat, lng, classificacao, chegada, unitrac_uploads!inner(data_relatorio)')
      .in('unitrac_uploads.data_relatorio', ['2026-05-19', '2026-05-20', '2026-05-25'])
      .range(offset, offset + 999)
    if (!page || page.length === 0) break
    paradas.push(...page)
    if (page.length < 1000) break
    offset += 1000
  }

  // Index paradas por placa
  const paradasByPlaca = new Map<string, any[]>()
  for (const p of paradas) {
    const arr = paradasByPlaca.get(p.placa_norm) ?? []
    arr.push(p); paradasByPlaca.set(p.placa_norm, arr)
  }

  // 4) Agrupa lojas únicas (rede + nome) e checa
  type LojaInfo = {
    rede: string
    nomeEscala: string
    placas: Set<string>
    cad?: any
    paradasLoja: any[] // paradas LOJA com cod do cadastro
    paradasGeo: any[]  // paradas FORA_BASE/LOJA com GPS perto do cadastro
    spreadMaximo: number
    distMedia: number
    distBase: number
  }
  const grupo = new Map<string, LojaInfo>()
  for (const e of esc ?? []) {
    if (!e.loja_nome_raw || !e.rede_id) continue
    const nomeNorm = normaliza(e.loja_nome_raw as string)
    const key = `${e.rede_id}|${nomeNorm}`
    let info = grupo.get(key)
    if (!info) {
      const cad = findCad(e.rede_id as string, e.loja_nome_raw as string)
      info = { rede: e.rede_id as string, nomeEscala: e.loja_nome_raw as string, placas: new Set(), cad, paradasLoja: [], paradasGeo: [], spreadMaximo: 0, distMedia: 0, distBase: Infinity }
      grupo.set(key, info)
    }
    if (e.placa_norm) info.placas.add(e.placa_norm as string)
  }

  // 5) Pra cada loja, coleta paradas relevantes
  for (const info of grupo.values()) {
    const cad = info.cad
    for (const placa of info.placas) {
      const ps = paradasByPlaca.get(placa) ?? []
      for (const p of ps) {
        // Match por cod cadastrado
        if (cad?.codigo_unitrac && p.codigo_loja === cad.codigo_unitrac && p.classificacao === 'LOJA') {
          info.paradasLoja.push(p)
        }
        // Match por GPS no raio do cadastro (T22-like)
        else if (cad?.lat != null && cad?.lng != null && p.lat != null && p.lng != null) {
          const d = haversine(p.lat, p.lng, cad.lat, cad.lng)
          if (d <= (cad.raio_metros ?? 200)) info.paradasGeo.push(p)
        }
      }
    }
    // Distância cadastro vs BASE
    if (cad?.lat != null && cad?.lng != null) {
      info.distBase = haversine(cad.lat, cad.lng, BASE_LAT, BASE_LNG)
    }
    // Spread GPS das paradas
    const lats: number[] = [], lngs: number[] = []
    for (const p of [...info.paradasLoja, ...info.paradasGeo]) {
      if (p.lat != null && p.lng != null) { lats.push(p.lat); lngs.push(p.lng) }
    }
    if (lats.length >= 2 && cad?.lat != null && cad?.lng != null) {
      let maxD = 0, sum = 0
      for (let i = 0; i < lats.length; i++) {
        const d = haversine(lats[i], lngs[i], cad.lat, cad.lng)
        sum += d; if (d > maxD) maxD = d
      }
      info.spreadMaximo = maxD
      info.distMedia = sum / lats.length
    }
  }

  // 6) Classifica status
  type Status = 'CERTO' | 'ERRADO_BASE' | 'SOBREPOSTO' | 'SEM_PARADA' | 'SEM_CADASTRO' | 'SEM_RASTRE' | 'OK_VIA_GEO'

  // Pra detectar SOBREPOSTO: cluster cross-rede (mesma coord, redes diferentes)
  const cadsPorCoord: Array<{ rede: string; nome: string; lat: number; lng: number }> = []
  for (const l of lojasDB ?? []) {
    if (l.lat != null && l.lng != null) cadsPorCoord.push({ rede: l.rede_id as string, nome: l.nome as string, lat: l.lat as number, lng: l.lng as number })
  }
  function isCluster(cad: any): boolean {
    if (!cad?.lat || !cad?.lng) return false
    return cadsPorCoord.some(c => c.rede !== cad.rede_id && haversine(c.lat, c.lng, cad.lat, cad.lng) <= 100)
  }

  type Linha = { rede: string; loja: string; placas: number; status: Status; obs: string }
  const linhas: Linha[] = []

  for (const info of grupo.values()) {
    let status: Status = 'CERTO'
    let obs = ''

    if (!info.cad) {
      // Sem cadastro — buscar nome parcial
      status = 'SEM_CADASTRO'
      obs = 'loja não cadastrada no banco'
    } else if (info.cad.lat == null || info.cad.lng == null) {
      status = 'SEM_CADASTRO'
      obs = 'cadastro sem lat/lng'
    } else if (info.distBase < 1500) {
      status = 'ERRADO_BASE'
      obs = `cadastro a ${Math.round(info.distBase)}m da BASE Benassi`
    } else if (isCluster(info.cad)) {
      status = 'SOBREPOSTO'
      obs = 'cadastro no mesmo ponto de outra rede'
    } else if (info.paradasLoja.length > 0) {
      // Tem parada LOJA com cod cadastrado — CERTO
      status = 'CERTO'
      const d = info.distMedia
      obs = `${info.paradasLoja.length} paradas LOJA cod=${info.cad.codigo_unitrac} (GPS médio ${Math.round(d)}m)`
    } else if (info.paradasGeo.length > 0) {
      // Sem parada com cod, mas GPS bate via T22
      status = 'OK_VIA_GEO'
      obs = `${info.paradasGeo.length} paradas no raio (sem cod) — T22 pega`
    } else {
      // Placa escalada não fez parada nesse cod
      const algumaPlacaTemUnitrac = [...info.placas].some(p => (paradasByPlaca.get(p) ?? []).length > 0)
      if (!algumaPlacaTemUnitrac) {
        status = 'SEM_RASTRE'
        obs = 'nenhuma placa escalada apareceu no Unitrac'
      } else {
        status = 'SEM_PARADA'
        obs = 'placa rastreada mas sem parada na coord da loja'
      }
    }

    linhas.push({ rede: info.rede, loja: info.nomeEscala, placas: info.placas.size, status, obs })
  }

  // 7) Gera relatório por rede
  const porRede = new Map<string, Linha[]>()
  for (const l of linhas) {
    const arr = porRede.get(l.rede) ?? []
    arr.push(l); porRede.set(l.rede, arr)
  }

  const STATUS_EMOJI: Record<Status, string> = {
    'CERTO': '✅',
    'OK_VIA_GEO': '🟢',
    'SEM_PARADA': '⚪',
    'SEM_RASTRE': '⚫',
    'SEM_CADASTRO': '🟡',
    'ERRADO_BASE': '🔴',
    'SOBREPOSTO': '🟠',
  }

  const out: string[] = [
    '# Lojas da escala × Unitrac — status loja por loja',
    '',
    'Análise loja por loja em cada escala dos 3 dias (19/20/25).',
    '',
    'Legenda:',
    '- ✅ **CERTO** — parada LOJA com cod cadastrado, GPS bate',
    '- 🟢 **OK_VIA_GEO** — sem cod no Unitrac, mas GPS bate na coord do cadastro (T22 pega)',
    '- ⚪ **SEM_PARADA** — placa rastreada mas não parou no cadastro dessa loja',
    '- ⚫ **SEM_RASTRE** — placa escalada não apareceu no Unitrac',
    '- 🟡 **SEM_CADASTRO** — loja na escala mas não cadastrada no banco',
    '- 🔴 **ERRADO_BASE** — cadastro com lat/lng em cima da BASE Benassi (Unitrac errado)',
    '- 🟠 **SOBREPOSTO** — cadastro no mesmo ponto de outra rede (Unitrac errado)',
    '',
  ]

  const redesOrd = [...porRede.keys()].sort()
  for (const rede of redesOrd) {
    const arr = porRede.get(rede)!
    const certos = arr.filter(x => x.status === 'CERTO' || x.status === 'OK_VIA_GEO').length
    const pct = Math.round(100 * certos / arr.length)
    out.push(`## ${rede} — ${certos}/${arr.length} certos (${pct}%)`)
    out.push('')
    out.push('| Loja na escala | Status | Placas | Observação |')
    out.push('|----------------|--------|--------|------------|')
    const ord = arr.sort((a, b) => {
      const order: Record<Status, number> = { 'CERTO': 1, 'OK_VIA_GEO': 2, 'SEM_PARADA': 3, 'SEM_RASTRE': 4, 'SEM_CADASTRO': 5, 'ERRADO_BASE': 6, 'SOBREPOSTO': 7 }
      return (order[a.status] - order[b.status]) || a.loja.localeCompare(b.loja)
    })
    for (const l of ord) {
      out.push(`| ${l.loja.slice(0, 60)} | ${STATUS_EMOJI[l.status]} ${l.status} | ${l.placas} | ${l.obs} |`)
    }
    out.push('')
  }

  // Sumário
  const sumario = new Map<string, Record<string, number>>()
  for (const l of linhas) {
    const s = sumario.get(l.rede) ?? {}
    s[l.status] = (s[l.status] ?? 0) + 1
    sumario.set(l.rede, s)
  }
  out.unshift('| Rede | ✅ | 🟢 | ⚪ | ⚫ | 🟡 | 🔴 | 🟠 | Total |', '|------|---|---|---|---|---|---|---|-------|')
  const linhasSumario = redesOrd.map(rede => {
    const s = sumario.get(rede) ?? {}
    const total = Object.values(s).reduce((a, b) => a + b, 0)
    return `| ${rede} | ${s['CERTO'] ?? 0} | ${s['OK_VIA_GEO'] ?? 0} | ${s['SEM_PARADA'] ?? 0} | ${s['SEM_RASTRE'] ?? 0} | ${s['SEM_CADASTRO'] ?? 0} | ${s['ERRADO_BASE'] ?? 0} | ${s['SOBREPOSTO'] ?? 0} | ${total} |`
  })
  out.unshift(...linhasSumario)
  out.unshift('## Sumário por rede', '')
  out.unshift(...['# Lojas da escala × Unitrac — status loja por loja', ''])

  writeFileSync('docs/conversas-tia-erica/ESCALA-VS-UNITRAC-LOJA-POR-LOJA.md', out.join('\n'))
  console.log(`OK → docs/conversas-tia-erica/ESCALA-VS-UNITRAC-LOJA-POR-LOJA.md`)
  console.log(`Total lojas únicas analisadas: ${linhas.length}`)
  for (const rede of redesOrd) {
    const arr = porRede.get(rede)!
    const certos = arr.filter(x => x.status === 'CERTO' || x.status === 'OK_VIA_GEO').length
    console.log(`  ${rede.padEnd(18)} ${certos}/${arr.length} certos`)
  }
})().catch(e => { console.error(e); process.exit(1) })
