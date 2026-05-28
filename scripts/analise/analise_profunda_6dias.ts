/**
 * Análise PROFUNDA dos 6 dias (18, 19, 20, 21, 22, 25):
 * - linha por linha (cada parada)
 * - endereço por endereço (clusters geográficos)
 * - detecta cods diferentes na mesma localização (bug Unitrac confirmado pelo William)
 * - detecta textos local_parada com múltiplas lojas (cadastros sobrepostos)
 *
 * Output: JSON estruturado + site HTML estático com tabs por dia.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const DIAS = ['2026-05-18', '2026-05-19', '2026-05-20', '2026-05-21', '2026-05-22', '2026-05-25']
const BASE_LAT = -22.828, BASE_LNG = -43.339
const OUT_DIR = 'docs/conversas-tia-erica/site-cadastro-unitrac'

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const f1 = lat1 * Math.PI / 180, f2 = lat2 * Math.PI / 180
  const df = (lat2 - lat1) * Math.PI / 180, dl = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(df/2)**2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl/2)**2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

// Detecta múltiplas lojas no texto local_parada
// Padrão: "12345 - NOME LOJA 1, 67890 - NOME LOJA 2"
const TOKEN_CODIGO_NOME = /(\d{4,8})\s*-\s*([A-ZÀ-Ü][^,()]+?)(?=\s*,\s*\d|\s*$)/gu
function extraiMultiLoja(s: string | null | undefined): Array<{ cod: string; nome: string }> {
  if (!s) return []
  const matches: Array<{ cod: string; nome: string }> = []
  for (const m of s.matchAll(TOKEN_CODIGO_NOME)) {
    if (m[2] && !/^BASE|^FORA|^ROTA/i.test(m[2])) {
      matches.push({ cod: m[1], nome: m[2].trim() })
    }
  }
  return matches
}

;(async () => {
  console.log(`Análise profunda dos ${DIAS.length} dias...`)

  // 1) Carrega TODAS as paradas dos 6 dias
  const paradas: any[] = []
  let offset = 0
  while (true) {
    const { data: page } = await sb.from('unitrac_paradas')
      .select('placa_norm, codigo_loja, nome_loja, lat, lng, classificacao, chegada, local_parada, endereco, unitrac_uploads!inner(data_relatorio)')
      .in('unitrac_uploads.data_relatorio', DIAS)
      .range(offset, offset + 999)
    if (!page || page.length === 0) break
    paradas.push(...page)
    if (page.length < 1000) break
    offset += 1000
  }
  console.log(`  paradas total: ${paradas.length}`)

  // 2) Carrega escalas dos 6 dias com paginação
  const esc: any[] = []
  let escOff = 0
  while (true) {
    const { data: page } = await sb.from('escala_linhas')
      .select('rede_id, loja_nome_raw, placa_norm, data_entrega')
      .in('data_entrega', DIAS)
      .not('placa_norm', 'is', null)
      .range(escOff, escOff + 999)
    if (!page || page.length === 0) break
    esc.push(...page)
    if (page.length < 1000) break
    escOff += 1000
  }
  console.log(`  escala_linhas: ${esc.length}`)

  // Por dia
  type Parada = typeof paradas[0]
  const paradasPorDia = new Map<string, Parada[]>()
  for (const p of paradas) {
    const d = p.unitrac_uploads?.data_relatorio
    if (!d) continue
    const arr = paradasPorDia.get(d) ?? []
    arr.push(p); paradasPorDia.set(d, arr)
  }

  // Escalas por dia
  type EscalaLinha = { rede_id: string; loja_nome_raw: string; placa_norm: string; data_entrega: string }
  const escalaPorDia = new Map<string, EscalaLinha[]>()
  for (const e of esc as EscalaLinha[]) {
    const arr = escalaPorDia.get(e.data_entrega) ?? []
    arr.push(e); escalaPorDia.set(e.data_entrega, arr)
  }

  // 3) Análise por dia: clusters geo, multi-loja no texto, paradas LOJA por placa
  type ClusterCod = { lat: number; lng: number; cods: Map<string, { nome: string; count: number }> }
  type DiaResult = {
    dia: string
    totalParadas: number
    totalLojas: number
    clustersGeo: ClusterCod[]  // mesma coord, cods diferentes
    paradasMultiTexto: Array<{ placa: string; chegada: string; local: string; lojas: Array<{ cod: string; nome: string }> }>  // local_parada com 2+ lojas no texto
    placasComEntrega: number
    placasSemEntrega: number
  }

  const resultados: DiaResult[] = []

  for (const dia of DIAS) {
    const ps = paradasPorDia.get(dia) ?? []
    const lojas = ps.filter(p => p.classificacao === 'LOJA')

    // Cluster geo por cod (≤100m)
    const codCoord = new Map<string, { lats: number[]; lngs: number[]; nomes: Set<string> }>()
    for (const p of lojas) {
      if (!p.codigo_loja || p.lat == null || p.lng == null) continue
      const x = codCoord.get(p.codigo_loja) ?? { lats: [], lngs: [], nomes: new Set() }
      x.lats.push(p.lat); x.lngs.push(p.lng); if (p.nome_loja) x.nomes.add(p.nome_loja)
      codCoord.set(p.codigo_loja, x)
    }
    const codMed = new Map<string, { lat: number; lng: number; nome: string }>()
    for (const [c, info] of codCoord) {
      const lats = [...info.lats].sort((a, b) => a - b)
      const lngs = [...info.lngs].sort((a, b) => a - b)
      codMed.set(c, { lat: lats[Math.floor(lats.length / 2)], lng: lngs[Math.floor(lngs.length / 2)], nome: [...info.nomes][0] ?? '?' })
    }

    // Clusteriza
    const usados = new Set<string>()
    const clusters: ClusterCod[] = []
    const codsArr = [...codMed.keys()]
    for (const c of codsArr) {
      if (usados.has(c)) continue
      const cs = codMed.get(c)!
      const grupo = new Map<string, { nome: string; count: number }>()
      grupo.set(c, { nome: cs.nome, count: codCoord.get(c)?.lats.length ?? 0 })
      usados.add(c)
      for (const c2 of codsArr) {
        if (usados.has(c2)) continue
        const cs2 = codMed.get(c2)!
        if (haversine(cs.lat, cs.lng, cs2.lat, cs2.lng) <= 100) {
          grupo.set(c2, { nome: cs2.nome, count: codCoord.get(c2)?.lats.length ?? 0 })
          usados.add(c2)
        }
      }
      if (grupo.size >= 2) clusters.push({ lat: cs.lat, lng: cs.lng, cods: grupo })
    }

    // Detecta paradas com múltiplas lojas no texto local_parada
    const multiTexto: DiaResult['paradasMultiTexto'] = []
    for (const p of ps) {
      const lojasNoTexto = extraiMultiLoja(p.local_parada)
      if (lojasNoTexto.length >= 2) {
        multiTexto.push({
          placa: p.placa_norm,
          chegada: p.chegada,
          local: (p.local_parada ?? '').slice(0, 200),
          lojas: lojasNoTexto,
        })
      }
    }

    // Placas com/sem entrega
    const placasEscaladas = new Set((escalaPorDia.get(dia) ?? []).map(e => e.placa_norm))
    const placasComLoja = new Set<string>()
    for (const p of lojas) if (placasEscaladas.has(p.placa_norm)) placasComLoja.add(p.placa_norm)

    resultados.push({
      dia,
      totalParadas: ps.length,
      totalLojas: lojas.length,
      clustersGeo: clusters,
      paradasMultiTexto: multiTexto,
      placasComEntrega: placasComLoja.size,
      placasSemEntrega: placasEscaladas.size - placasComLoja.size,
    })

    console.log(`\n=== ${dia} ===`)
    console.log(`  paradas: ${ps.length} (${lojas.length} LOJA)`)
    console.log(`  clusters cods diferentes mesma coord: ${clusters.length}`)
    console.log(`  paradas com 2+ lojas no texto: ${multiTexto.length}`)
    console.log(`  placas escaladas com entrega: ${placasComLoja.size}/${placasEscaladas.size}`)
  }

  // 4) Análise CONSOLIDADA: cods agrupados em clusters cross-rede + lojas frequentemente sobrepostas
  type CodInfo = {
    cod: string
    nome: string
    rede: string
    coords: Array<{ dia: string; lat: number; lng: number; placa: string }>
    aparecimentos: number
    dias: Set<string>
  }
  const consolidado = new Map<string, CodInfo>()
  for (const p of paradas) {
    if (p.classificacao !== 'LOJA' || !p.codigo_loja || p.lat == null || p.lng == null) continue
    const dia = p.unitrac_uploads?.data_relatorio
    const x = consolidado.get(p.codigo_loja) ?? { cod: p.codigo_loja, nome: p.nome_loja ?? '?', rede: '?', coords: [], aparecimentos: 0, dias: new Set() }
    x.coords.push({ dia, lat: p.lat, lng: p.lng, placa: p.placa_norm })
    x.aparecimentos++
    if (dia) x.dias.add(dia)
    consolidado.set(p.codigo_loja, x)
  }

  // Salva JSON estruturado
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(`${OUT_DIR}/dados-analise.json`, JSON.stringify({
    geradoEm: new Date().toISOString(),
    dias: DIAS,
    porDia: resultados.map(r => ({
      ...r,
      clustersGeo: r.clustersGeo.map(c => ({
        lat: c.lat,
        lng: c.lng,
        cods: [...c.cods.entries()].map(([cod, info]) => ({ cod, ...info })),
      })),
    })),
    totaisCons: {
      cods: consolidado.size,
      paradas: paradas.length,
    },
  }, null, 2))

  console.log(`\n✓ JSON salvo: ${OUT_DIR}/dados-analise.json`)

  // ===== Gera HTML estático com tabs por dia =====
  type LojaLinha = { rede: string; loja: string; placa: string; status: 'CERTO' | 'BUGADO' | 'SEM_INFO'; obs: string; cod?: string }
  type DiaUI = {
    dia: string
    diaLabel: string
    statsPlacas: { com: number; sem: number; total: number }
    statsLojas: { certo: number; bugado: number; semInfo: number }
    clustersGeo: ClusterCod[]
    multiTexto: DiaResult['paradasMultiTexto']
    porRede: Map<string, LojaLinha[]>
  }
  const uiDias: DiaUI[] = []

  for (const r of resultados) {
    const dia = r.dia
    const escDia = escalaPorDia.get(dia) ?? []
    const ps = paradasPorDia.get(dia) ?? []
    const paradasPorPlaca = new Map<string, Parada[]>()
    for (const p of ps) {
      const arr = paradasPorPlaca.get(p.placa_norm) ?? []
      arr.push(p); paradasPorPlaca.set(p.placa_norm, arr)
    }

    // Detecta cods bugados desse dia (em cluster geo ou na BASE)
    const codsBugadosDia = new Set<string>()
    for (const cl of r.clustersGeo) for (const c of cl.cods.keys()) codsBugadosDia.add(c)
    // Adiciona cods em região BASE
    for (const p of ps) {
      if (p.classificacao === 'LOJA' && p.codigo_loja && p.lat != null && p.lng != null) {
        if (haversine(p.lat, p.lng, BASE_LAT, BASE_LNG) < 1500) codsBugadosDia.add(p.codigo_loja)
      }
    }

    // Classifica cada loja única da escala
    const porRede = new Map<string, LojaLinha[]>()
    const lojasVistas = new Set<string>()
    for (const e of escDia) {
      const key = `${e.rede_id}|${e.loja_nome_raw}|${e.placa_norm}`
      if (lojasVistas.has(key)) continue
      lojasVistas.add(key)
      const ps2 = paradasPorPlaca.get(e.placa_norm) ?? []
      const lojasParada = ps2.filter(p => p.classificacao === 'LOJA' && p.codigo_loja)
      let status: 'CERTO' | 'BUGADO' | 'SEM_INFO' = 'SEM_INFO'
      let obs = 'placa não fez parada LOJA com cod — não dá pra saber se cadastro está OK'
      let cod: string | undefined
      const bonsCods: string[] = []
      const bugCods: string[] = []
      for (const p of lojasParada) {
        if (codsBugadosDia.has(p.codigo_loja!)) bugCods.push(p.codigo_loja!)
        else bonsCods.push(p.codigo_loja!)
      }
      if (bonsCods.length > 0) {
        status = 'CERTO'
        cod = bonsCods[0]
        obs = `cod ${[...new Set(bonsCods)].slice(0, 2).join(',')}`
      } else if (bugCods.length > 0) {
        status = 'BUGADO'
        cod = bugCods[0]
        obs = `cod sobreposto/mal cadastrado: ${[...new Set(bugCods)].slice(0, 2).join(',')}`
      }
      const arr = porRede.get(e.rede_id) ?? []
      arr.push({ rede: e.rede_id, loja: e.loja_nome_raw, placa: e.placa_norm, status, obs, cod })
      porRede.set(e.rede_id, arr)
    }

    let certo = 0, bugado = 0, semInfo = 0
    for (const arr of porRede.values()) for (const l of arr) {
      if (l.status === 'CERTO') certo++
      else if (l.status === 'BUGADO') bugado++
      else semInfo++
    }

    const placasEsc = new Set(escDia.map(e => e.placa_norm))
    const placasComLoja = new Set<string>()
    for (const p of ps) if (p.classificacao === 'LOJA' && p.codigo_loja && placasEsc.has(p.placa_norm)) placasComLoja.add(p.placa_norm)

    uiDias.push({
      dia,
      diaLabel: new Date(dia + 'T12:00:00Z').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }),
      statsPlacas: { com: placasComLoja.size, sem: placasEsc.size - placasComLoja.size, total: placasEsc.size },
      statsLojas: { certo, bugado, semInfo } as any,
      clustersGeo: r.clustersGeo,
      multiTexto: r.paradasMultiTexto,
      porRede,
    })
  }

  // HTML
  const css = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', system-ui, sans-serif; background: #f5f7fa; color: #1a3a52; line-height: 1.5; padding-bottom: 60px; }
.container { max-width: 1380px; margin: 0 auto; padding: 24px; }
header { background: linear-gradient(135deg, #1a3a52 0%, #2a6080 100%); color: white; padding: 28px 24px; margin: -24px -24px 24px -24px; border-radius: 0 0 12px 12px; }
header h1 { font-size: 26px; font-weight: 700; }
header .sub { opacity: 0.85; margin-top: 4px; font-size: 13px; }
.aviso { background: #fff4e0; border-left: 5px solid #ff9500; padding: 14px 18px; margin-bottom: 24px; border-radius: 6px; font-size: 13px; }
.aviso strong { color: #b04400; }
.dia-tabs { display: flex; gap: 8px; margin-bottom: 20px; overflow-x: auto; }
.dia-tab { padding: 12px 18px; background: white; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 14px; min-width: 100px; text-align: center; user-select: none; box-shadow: 0 1px 3px rgba(0,0,0,0.05); white-space: nowrap; transition: all 0.15s; }
.dia-tab:hover { background: #e8eef3; }
.dia-tab.active { background: #1a3a52; color: white; }
.dia-tab .sm { display: block; font-size: 11px; opacity: 0.75; font-weight: 400; margin-top: 2px; }
.dia-content { display: none; }
.dia-content.active { display: block; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; margin-bottom: 24px; }
.stat { background: white; padding: 16px; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
.stat .label { font-size: 11px; text-transform: uppercase; color: #6b7c8a; letter-spacing: 0.5px; }
.stat .value { font-size: 26px; font-weight: 700; margin-top: 4px; }
.stat.ok .value { color: #2a8050; }
.stat.bad .value { color: #c0392b; }
.stat.gray .value { color: #7d8a99; }
.section { background: white; padding: 22px; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); margin-bottom: 20px; }
.section h2 { font-size: 18px; margin-bottom: 4px; }
.section .desc { color: #6b7c8a; font-size: 12px; margin-bottom: 14px; }
table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
th { background: #1a3a52; color: white; padding: 8px 10px; text-align: left; font-weight: 600; }
td { padding: 8px 10px; border-bottom: 1px solid #eee; }
tr:hover td { background: #f9fafc; }
.status-pill { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; white-space: nowrap; }
.status-pill.CERTO { background: #d6f0dd; color: #1f6b3b; }
.status-pill.BUGADO { background: #fbe0db; color: #a02e1e; }
.status-pill.SEM_INFO { background: #e8ecf2; color: #4a5868; }
.code { font-family: 'Courier New', monospace; font-size: 11px; background: #f0f3f7; padding: 1px 5px; border-radius: 3px; color: #1a3a52; }
.rede-block { margin-bottom: 18px; }
.rede-block h3 { font-size: 14px; padding: 6px 10px; background: #e8eef3; border-radius: 4px 4px 0 0; }
.rede-stats { font-size: 11px; color: #6b7c8a; margin-left: 8px; }
.cluster { padding: 10px 12px; margin-bottom: 8px; background: #fff8f0; border-left: 4px solid #ff9500; border-radius: 4px; font-size: 12px; }
.cluster ul { margin-top: 6px; margin-left: 18px; }
.cluster li { margin-bottom: 2px; }
.subtab { display: inline-block; padding: 6px 12px; margin-right: 4px; margin-bottom: 8px; background: #e8eef3; border-radius: 14px; cursor: pointer; font-size: 12px; font-weight: 600; }
.subtab.active { background: #1a3a52; color: white; }
.subcontent { display: none; }
.subcontent.active { display: block; }
.controls { margin-bottom: 12px; display: flex; gap: 10px; flex-wrap: wrap; }
.controls input, .controls select { padding: 6px 10px; border: 1px solid #ddd; border-radius: 5px; font-size: 13px; }
.controls input { flex: 1; min-width: 200px; }
`

  function renderDia(d: DiaUI, idx: number): string {
    // Tabela clusters geo
    const clustersHTML = d.clustersGeo.map(cl => {
      const cods = [...cl.cods.entries()]
      const cods_html = cods.map(([cod, info]) => `<li><span class="code">${cod}</span> ${info.nome} <span class="rede-stats">(${info.count}x)</span></li>`).join('')
      return `<div class="cluster"><strong>📍 lat=${cl.lat.toFixed(4)} lng=${cl.lng.toFixed(4)}</strong> — ${cods.length} códigos diferentes no mesmo ponto:<ul>${cods_html}</ul></div>`
    }).join('') || '<p style="color:#888">Nenhum cluster detectado neste dia</p>'

    // Tabela multi-texto
    const multiHTML = d.multiTexto.slice(0, 50).map(m => {
      const lojas = m.lojas.map(l => `<span class="code">${l.cod}</span> ${l.nome.slice(0, 30)}`).join(' / ')
      return `<tr><td class="code">${m.placa}</td><td>${m.chegada?.slice(11, 16)}</td><td>${lojas}</td></tr>`
    }).join('') || '<tr><td colspan="3" style="text-align:center;color:#888">Nenhuma parada com texto multi-loja</td></tr>'

    // Lojas por rede
    const redesOrd = [...d.porRede.keys()].sort()
    const lojasHTML = redesOrd.map(rede => {
      const arr = d.porRede.get(rede)!
      const certo = arr.filter(l => l.status === 'CERTO').length
      const ord = arr.sort((a, b) => (a.status === 'CERTO' ? -1 : 1) - (b.status === 'CERTO' ? -1 : 1) || a.loja.localeCompare(b.loja))
      const rows = ord.map(l => `<tr data-status="${l.status}"><td>${l.loja}</td><td class="code">${l.placa}</td><td><span class="status-pill ${l.status}">${l.status}</span></td><td>${l.cod ? `<span class="code">${l.cod}</span>` : ''}</td><td style="color:#6b7c8a;font-size:11px">${l.obs}</td></tr>`).join('')
      return `<div class="rede-block">
        <h3>${rede} <span class="rede-stats">${certo}/${arr.length} certos</span></h3>
        <table><thead><tr><th>Loja</th><th>Placa</th><th>Status</th><th>Cod</th><th>Obs</th></tr></thead><tbody>${rows}</tbody></table>
      </div>`
    }).join('')

    return `<div class="dia-content ${idx === 0 ? 'active' : ''}" data-dia="${d.dia}">
      <div class="stats">
        <div class="stat ok"><div class="label">Lojas CERTAS</div><div class="value">${d.statsLojas.certo}</div></div>
        <div class="stat bad"><div class="label">Lojas BUGADAS</div><div class="value">${d.statsLojas.bugado}</div></div>
        <div class="stat gray"><div class="label">Sem info</div><div class="value">${d.statsLojas.semInfo}</div></div>
        <div class="stat"><div class="label">Placas com entrega</div><div class="value">${d.statsPlacas.com}/${d.statsPlacas.total}</div></div>
      </div>

      <div class="subtab active" data-sub="lojas-${d.dia}">Lojas escaladas</div>
      <div class="subtab" data-sub="clusters-${d.dia}">Clusters bugados</div>
      <div class="subtab" data-sub="multi-${d.dia}">Paradas multi-loja</div>

      <div class="subcontent active" id="lojas-${d.dia}">
        <div class="controls">
          <input type="text" class="search-loja" placeholder="Buscar loja ou placa...">
          <select class="filter-status">
            <option value="">Todas</option>
            <option value="CERTO">Só CERTO</option>
            <option value="BUGADO">Só BUGADO</option>
            <option value="SEM_INFO">Só SEM INFO</option>
          </select>
        </div>
        ${lojasHTML}
      </div>

      <div class="subcontent" id="clusters-${d.dia}">
        <div class="section">
          <h2>Clusters: cods diferentes na mesma localização</h2>
          <div class="desc">2+ códigos de loja diferentes dentro de 100m — bug de cadastro Unitrac (cliente cadastra várias lojas no mesmo endereço).</div>
          ${clustersHTML}
        </div>
      </div>

      <div class="subcontent" id="multi-${d.dia}">
        <div class="section">
          <h2>Paradas com texto contendo várias lojas</h2>
          <div class="desc">Quando o caminhão está em trânsito sem geofence específico, o Unitrac lista todos os "observação" da região. Mostrando até 50 exemplos do dia.</div>
          <table><thead><tr><th>Placa</th><th>Hora</th><th>Lojas no texto</th></tr></thead><tbody>${multiHTML}</tbody></table>
        </div>
      </div>
    </div>`
  }

  // Sumário geral
  let totalCerto = 0, totalBugado = 0, totalSemInfo = 0
  for (const d of uiDias) {
    totalCerto += d.statsLojas.certo
    totalBugado += d.statsLojas.bugado
    totalSemInfo += d.statsLojas.semInfo
  }
  const totalGeral = totalCerto + totalBugado + totalSemInfo

  const html = `<!DOCTYPE html>
<html lang="pt-br"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Análise Cadastro Unitrac — 6 dias</title>
<style>${css}</style>
</head><body>
<div class="container">
  <header>
    <h1>Análise Cadastro Unitrac — 6 dias</h1>
    <div class="sub">Cruzamento Escalas × Relatórios Unitrac — dias 18, 19, 20, 21, 22 e 25 de maio de 2026</div>
  </header>

  <div class="aviso">
    <strong>⚠️ ATENÇÃO — ESTIMATIVA</strong><br>
    Análise automática cruzando escalas e PDFs do Unitrac. Pode haver falsos positivos/negativos.
    Usar como guia de prioridades — confirmação manual recomendada antes de decisões definitivas.
  </div>

  <div class="section" style="margin-bottom:24px">
    <h2>Como interpretar essa análise</h2>
    <div class="desc">Cada linha do relatório representa uma loja escalada num dia específico. Existem 3 status possíveis:</div>
    <table style="margin-top:8px">
      <thead><tr><th style="width:140px">Status</th><th>O que significa</th><th>O que fazer</th></tr></thead>
      <tbody>
        <tr><td><span class="status-pill CERTO">✓ CERTO</span></td><td>A placa escalada parou na loja e o Unitrac registrou o cod específico dessa loja. Cadastro funcionando bem.</td><td>Sistema pode gerar KPI automático.</td></tr>
        <tr><td><span class="status-pill BUGADO">✗ BUGADO</span></td><td>Cadastro mal feito no Unitrac. O cod aparece junto com outros cods diferentes no mesmo endereço (sobreposição) ou está no mesmo ponto que a BASE Benassi.</td><td>Pedir correção pra Benassi/Unitrac.</td></tr>
        <tr><td><span class="status-pill SEM_INFO">— SEM INFO</span></td><td>A placa escalada NÃO fez parada LOJA com cod naquele dia. Pode ser: placa não saiu, não entregou, ou cadastro inexistente — não dá pra saber.</td><td>Aguardar outro dia de dados ou verificar manualmente.</td></tr>
      </tbody>
    </table>
    <div class="desc" style="margin-top:12px"><strong>Por que isso acontece?</strong> Confirmado pelo William (ex-KPI) em áudio: o cliente cadastra suas lojas dentro do Unitrac. Quando o cadastro vem com geofences sobrepostos ou no mesmo endereço, o Unitrac reporta vários nomes diferentes pra mesma parada — é bug DELES, não do nosso sistema. Análise baseada em 6 dias: 18, 19, 20, 21, 22 e 25 de maio de 2026.</div>
  </div>

  <div class="stats">
    <div class="stat"><div class="label">Total análises (loja×dia)</div><div class="value">${totalGeral}</div></div>
    <div class="stat ok"><div class="label">CERTAS no Unitrac</div><div class="value">${totalCerto}</div></div>
    <div class="stat bad"><div class="label">BUGADAS no Unitrac</div><div class="value">${totalBugado}</div></div>
    <div class="stat gray"><div class="label">SEM INFO</div><div class="value">${totalSemInfo}</div></div>
  </div>

  <div class="dia-tabs">${uiDias.map((d, i) => `<div class="dia-tab ${i === 0 ? 'active' : ''}" data-dia="${d.dia}">${d.dia.slice(8, 10)}/05<span class="sm">${d.diaLabel.split(',')[0]}</span></div>`).join('')}</div>

  ${uiDias.map((d, i) => renderDia(d, i)).join('\n')}
</div>

<script>
const diaTabs = document.querySelectorAll('.dia-tab');
const diaContents = document.querySelectorAll('.dia-content');
diaTabs.forEach(t => t.addEventListener('click', () => {
  diaTabs.forEach(x => x.classList.remove('active'));
  diaContents.forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  document.querySelector('.dia-content[data-dia="' + t.dataset.dia + '"]').classList.add('active');
}));

document.querySelectorAll('.subtab').forEach(st => st.addEventListener('click', () => {
  const parent = st.closest('.dia-content');
  parent.querySelectorAll('.subtab').forEach(x => x.classList.remove('active'));
  parent.querySelectorAll('.subcontent').forEach(x => x.classList.remove('active'));
  st.classList.add('active');
  document.getElementById(st.dataset.sub).classList.add('active');
}));

document.querySelectorAll('.dia-content').forEach(dc => {
  const search = dc.querySelector('.search-loja');
  const filter = dc.querySelector('.filter-status');
  if (!search) return;
  function apply() {
    const q = search.value.toLowerCase();
    const f = filter.value;
    dc.querySelectorAll('tbody tr').forEach(tr => {
      const txt = tr.textContent.toLowerCase();
      const status = tr.dataset.status;
      const ok = (!q || txt.includes(q)) && (!f || status === f);
      tr.style.display = ok ? '' : 'none';
    });
  }
  search.addEventListener('input', apply);
  filter.addEventListener('change', apply);
});
</script>
</body></html>`

  writeFileSync(`${OUT_DIR}/index.html`, html)
  console.log(`✓ HTML salvo: ${OUT_DIR}/index.html`)
})().catch(e => { console.error(e); process.exit(1) })
