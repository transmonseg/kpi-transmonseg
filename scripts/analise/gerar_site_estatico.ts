/**
 * Análise loja por loja dos 6 dias (18/19/20/21/22/25), classifica como
 * CERTO ou BUGADO no Unitrac (sem usar cadastro interno) e gera site estático.
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

;(async () => {
  console.log(`Carregando dados dos 6 dias...`)

  // 1) Escalas
  const { data: esc } = await sb.from('escala_linhas')
    .select('rede_id, loja_nome_raw, placa_norm, data_entrega')
    .in('data_entrega', DIAS)
    .not('placa_norm', 'is', null)
  console.log(`  escala_linhas: ${esc?.length ?? 0}`)

  // 2) Paradas com paginação
  const paradas: any[] = []
  let offset = 0
  while (true) {
    const { data: page } = await sb.from('unitrac_paradas')
      .select('placa_norm, codigo_loja, nome_loja, lat, lng, classificacao, chegada, unitrac_uploads!inner(data_relatorio)')
      .in('unitrac_uploads.data_relatorio', DIAS)
      .range(offset, offset + 999)
    if (!page || page.length === 0) break
    paradas.push(...page)
    if (page.length < 1000) break
    offset += 1000
  }
  console.log(`  paradas: ${paradas.length}`)

  // Index paradas por placa+dia
  const paradasPorPlacaDia = new Map<string, any[]>()
  for (const p of paradas) {
    const dia = p.unitrac_uploads?.data_relatorio
    if (!dia) continue
    const key = `${p.placa_norm}|${dia}`
    const arr = paradasPorPlacaDia.get(key) ?? []
    arr.push(p); paradasPorPlacaDia.set(key, arr)
  }

  // Detecta cods sobrepostos / na BASE
  const codStats = new Map<string, { lat: number; lng: number; nome: string }>()
  const byCod = new Map<string, { lats: number[]; lngs: number[]; nomes: Set<string> }>()
  for (const p of paradas) {
    if (p.classificacao !== 'LOJA' || !p.codigo_loja || p.lat == null || p.lng == null) continue
    const x = byCod.get(p.codigo_loja) ?? { lats: [], lngs: [], nomes: new Set() }
    x.lats.push(p.lat); x.lngs.push(p.lng); if (p.nome_loja) x.nomes.add(p.nome_loja)
    byCod.set(p.codigo_loja, x)
  }
  for (const [cod, info] of byCod) {
    const lats = [...info.lats].sort((a, b) => a - b)
    const lngs = [...info.lngs].sort((a, b) => a - b)
    codStats.set(cod, { lat: lats[Math.floor(lats.length / 2)], lng: lngs[Math.floor(lngs.length / 2)], nome: [...info.nomes][0] ?? '?' })
  }
  const codsSobrepostos = new Set<string>()
  const codsNaBase = new Set<string>()
  const codsArr = [...codStats.keys()]
  for (const c of codsArr) {
    const cs = codStats.get(c)!
    if (haversine(cs.lat, cs.lng, BASE_LAT, BASE_LNG) < 1500) codsNaBase.add(c)
    for (const c2 of codsArr) {
      if (c === c2) continue
      const cs2 = codStats.get(c2)!
      if (haversine(cs.lat, cs.lng, cs2.lat, cs2.lng) <= 100) {
        codsSobrepostos.add(c); codsSobrepostos.add(c2)
      }
    }
  }

  // Agrupa lojas
  type LojaInfo = {
    rede: string; loja: string; placas: Set<string>; diasEsc: Set<string>
    boas: Set<string>; bugadas: Set<string>; sem: Set<string>
    codsBons: Set<string>; codsBugados: Set<string>
  }
  const grupo = new Map<string, LojaInfo>()
  for (const e of esc ?? []) {
    if (!e.loja_nome_raw || !e.rede_id || !e.placa_norm || !e.data_entrega) continue
    const key = `${e.rede_id}|${e.loja_nome_raw}`
    let info = grupo.get(key)
    if (!info) {
      info = { rede: e.rede_id as string, loja: e.loja_nome_raw as string, placas: new Set(), diasEsc: new Set(), boas: new Set(), bugadas: new Set(), sem: new Set(), codsBons: new Set(), codsBugados: new Set() }
      grupo.set(key, info)
    }
    info.placas.add(e.placa_norm as string)
    info.diasEsc.add(e.data_entrega as string)

    const ps = paradasPorPlacaDia.get(`${e.placa_norm}|${e.data_entrega}`) ?? []
    const lojas = ps.filter(p => p.classificacao === 'LOJA' && p.codigo_loja)
    if (lojas.length === 0) info.sem.add(e.data_entrega as string)
    else {
      let temBoa = false
      for (const p of lojas) {
        const cod = p.codigo_loja as string
        if (codsSobrepostos.has(cod) || codsNaBase.has(cod)) info.codsBugados.add(cod)
        else { info.codsBons.add(cod); temBoa = true }
      }
      if (temBoa) info.boas.add(e.data_entrega as string)
      else info.bugadas.add(e.data_entrega as string)
    }
  }

  // Classifica
  type Status = 'CERTO' | 'BUGADO'
  type Linha = { rede: string; loja: string; status: Status; obs: string; placas: number; dias: number; codsOk: string[]; codsBug: string[] }
  const linhas: Linha[] = []
  for (const info of grupo.values()) {
    const boas = info.boas.size, bugadas = info.bugadas.size
    const totalDias = info.diasEsc.size
    let status: Status, obs: string
    if (boas > 0 && boas >= bugadas) {
      status = 'CERTO'
      const cods = [...info.codsBons]
      obs = `${boas}/${totalDias} dias com parada LOJA cod=${cods.slice(0, 3).join(',')}`
    } else if (bugadas > 0 || info.codsBugados.size > 0) {
      status = 'BUGADO'
      const cods = [...info.codsBugados]
      obs = `cod sobreposto/em BASE: ${cods.slice(0, 3).join(',')}`
    } else {
      status = 'BUGADO'
      obs = `placa nunca fez parada LOJA com cod (${info.sem.size}/${totalDias} dias)`
    }
    linhas.push({ rede: info.rede, loja: info.loja, status, obs, placas: info.placas.size, dias: totalDias, codsOk: [...info.codsBons], codsBug: [...info.codsBugados] })
  }

  // Agrupa por rede
  const porRede = new Map<string, Linha[]>()
  for (const l of linhas) {
    const arr = porRede.get(l.rede) ?? []
    arr.push(l); porRede.set(l.rede, arr)
  }
  const redesOrd = [...porRede.keys()].sort((a, b) => {
    const ra = porRede.get(a)!, rb = porRede.get(b)!
    const pa = ra.filter(l => l.status === 'CERTO').length / ra.length
    const pb = rb.filter(l => l.status === 'CERTO').length / rb.length
    return pb - pa
  })

  // Gera HTML
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

  const totalLojas = linhas.length
  const totalCertas = linhas.filter(l => l.status === 'CERTO').length
  const pctGlobal = Math.round(100 * totalCertas / totalLojas)

  const css = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; background: #f5f7fa; color: #1a3a52; line-height: 1.5; }
.container { max-width: 1280px; margin: 0 auto; padding: 24px; }
header { background: linear-gradient(135deg, #1a3a52 0%, #2a6080 100%); color: white; padding: 32px 24px; margin: -24px -24px 24px -24px; border-radius: 0 0 12px 12px; }
header h1 { font-size: 28px; font-weight: 700; }
header .sub { opacity: 0.85; margin-top: 4px; font-size: 14px; }
.aviso { background: #fff4e0; border-left: 5px solid #ff9500; padding: 16px 20px; margin-bottom: 24px; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
.aviso strong { color: #b04400; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 32px; }
.stat { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.05); }
.stat .label { font-size: 12px; text-transform: uppercase; color: #6b7c8a; letter-spacing: 0.5px; }
.stat .value { font-size: 32px; font-weight: 700; margin-top: 4px; }
.stat.ok .value { color: #2a8050; }
.stat.bad .value { color: #c0392b; }
.tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.tab { padding: 8px 14px; background: white; border: 2px solid #ddd; border-radius: 20px; cursor: pointer; font-size: 13px; font-weight: 500; transition: all 0.15s; user-select: none; }
.tab:hover { border-color: #2a6080; }
.tab.active { background: #1a3a52; color: white; border-color: #1a3a52; }
.tab .badge { display: inline-block; margin-left: 6px; padding: 1px 8px; border-radius: 10px; font-size: 11px; background: rgba(0,0,0,0.08); }
.tab.active .badge { background: rgba(255,255,255,0.2); }
.controls { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
.controls input { padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; flex: 1; min-width: 200px; }
.controls select { padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; background: white; }
.rede-section { display: none; background: white; padding: 24px; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.05); margin-bottom: 16px; }
.rede-section.active { display: block; }
.rede-section h2 { font-size: 22px; margin-bottom: 4px; }
.rede-section .meta { color: #6b7c8a; font-size: 13px; margin-bottom: 16px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th { background: #1a3a52; color: white; padding: 10px 12px; text-align: left; font-weight: 600; position: sticky; top: 0; }
td { padding: 10px 12px; border-bottom: 1px solid #eee; }
tr:hover td { background: #f9fafc; }
.status-pill { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
.status-pill.CERTO { background: #d6f0dd; color: #1f6b3b; }
.status-pill.BUGADO { background: #fbe0db; color: #a02e1e; }
.obs { color: #6b7c8a; font-size: 12px; }
.code { font-family: 'Courier New', monospace; font-size: 11px; background: #f0f3f7; padding: 2px 6px; border-radius: 3px; }
@media print { .tabs, .controls { display: none; } .rede-section { display: block !important; page-break-inside: avoid; } }
`

  const sumarioRows = redesOrd.map(rede => {
    const arr = porRede.get(rede)!
    const certos = arr.filter(l => l.status === 'CERTO').length
    const pct = Math.round(100 * certos / arr.length)
    return `<tr><td><strong>${rede}</strong></td><td>${certos}</td><td>${arr.length - certos}</td><td>${arr.length}</td><td><strong>${pct}%</strong></td></tr>`
  }).join('')

  const tabs = redesOrd.map((rede, i) => {
    const arr = porRede.get(rede)!
    const certos = arr.filter(l => l.status === 'CERTO').length
    const pct = Math.round(100 * certos / arr.length)
    return `<div class="tab ${i === 0 ? 'active' : ''}" data-rede="${rede}">${rede} <span class="badge">${pct}%</span></div>`
  }).join('')

  const sections = redesOrd.map((rede, i) => {
    const arr = porRede.get(rede)!.sort((a, b) => (a.status === 'CERTO' ? -1 : 1) - (b.status === 'CERTO' ? -1 : 1) || a.loja.localeCompare(b.loja))
    const certos = arr.filter(l => l.status === 'CERTO').length
    const pct = Math.round(100 * certos / arr.length)
    const rows = arr.map(l => {
      const codBadge = l.status === 'CERTO' && l.codsOk.length > 0
        ? `<span class="code">${l.codsOk.slice(0, 2).join(',')}</span>`
        : l.codsBug.length > 0 ? `<span class="code" style="color:#a02e1e">${l.codsBug.slice(0, 2).join(',')}</span>` : ''
      return `<tr data-status="${l.status}"><td>${l.loja}</td><td><span class="status-pill ${l.status}">${l.status === 'CERTO' ? '✓ CERTO' : '✗ BUGADO'}</span></td><td>${codBadge}</td><td>${l.placas}</td><td>${l.dias}</td><td class="obs">${l.obs}</td></tr>`
    }).join('')
    return `<div class="rede-section ${i === 0 ? 'active' : ''}" data-rede="${rede}">
  <h2>${rede}</h2>
  <div class="meta">${certos} de ${arr.length} lojas com cadastro CERTO no Unitrac (${pct}%)</div>
  <table>
    <thead><tr><th>Loja</th><th>Status</th><th>Cod Unitrac</th><th>Placas</th><th>Dias</th><th>Observação</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>`
  }).join('\n')

  const html = `<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Análise Cadastro Unitrac — Estimativa</title>
<style>${css}</style>
</head>
<body>
<div class="container">
  <header>
    <h1>Análise de Cadastro Unitrac</h1>
    <div class="sub">Cruzamento Escalas × Relatórios Unitrac — 6 dias (18, 19, 20, 21, 22 e 25/05/2026)</div>
  </header>

  <div class="aviso">
    <strong>⚠️ ATENÇÃO — ESTA ANÁLISE É ESTIMATIVA, NÃO É CERTEZA ABSOLUTA</strong><br><br>
    Os dados foram gerados automaticamente cruzando escalas e PDFs do Unitrac. Pode haver:<br>
    • Falsos positivos (loja marcada CERTA que na verdade tem problema)<br>
    • Falsos negativos (loja BUGADA que na verdade está OK)<br><br>
    A classificação depende de: <strong>placa rastreada nos dias analisados</strong>, <strong>Unitrac reportar código específico</strong>, <strong>ausência de geofences sobrepostos com a BASE Benassi</strong> ou outras lojas.<br>
    Use como guia de prioridades — confirmação manual recomendada antes de tomar decisões definitivas.
  </div>

  <div class="stats">
    <div class="stat"><div class="label">Lojas analisadas</div><div class="value">${totalLojas}</div></div>
    <div class="stat ok"><div class="label">Cadastro CERTO</div><div class="value">${totalCertas}</div></div>
    <div class="stat bad"><div class="label">Cadastro BUGADO</div><div class="value">${totalLojas - totalCertas}</div></div>
    <div class="stat"><div class="label">% Aproveitamento</div><div class="value">${pctGlobal}%</div></div>
  </div>

  <h2 style="margin-bottom:12px">Sumário por rede</h2>
  <div class="rede-section active" style="margin-bottom:24px">
    <table>
      <thead><tr><th>Rede</th><th>✓ Certo</th><th>✗ Bugado</th><th>Total</th><th>% Certo</th></tr></thead>
      <tbody>${sumarioRows}</tbody>
    </table>
  </div>

  <h2 style="margin-bottom:12px">Detalhes por rede</h2>

  <div class="controls">
    <input type="text" id="search" placeholder="Buscar loja...">
    <select id="filter">
      <option value="">Todas</option>
      <option value="CERTO">Só CERTO</option>
      <option value="BUGADO">Só BUGADO</option>
    </select>
  </div>

  <div class="tabs">${tabs}</div>
  ${sections}
</div>

<script>
const tabs = document.querySelectorAll('.tab[data-rede]');
const sections = document.querySelectorAll('.rede-section[data-rede]');
tabs.forEach(t => t.addEventListener('click', () => {
  tabs.forEach(x => x.classList.remove('active'));
  sections.forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  document.querySelector('.rede-section[data-rede="' + t.dataset.rede + '"]').classList.add('active');
}));

const search = document.getElementById('search');
const filter = document.getElementById('filter');
function apply() {
  const q = search.value.toLowerCase();
  const f = filter.value;
  sections.forEach(sec => {
    sec.querySelectorAll('tbody tr').forEach(tr => {
      const txt = tr.textContent.toLowerCase();
      const status = tr.dataset.status;
      const ok = (!q || txt.includes(q)) && (!f || status === f);
      tr.style.display = ok ? '' : 'none';
    });
  });
}
search.addEventListener('input', apply);
filter.addEventListener('change', apply);
</script>
</body>
</html>`

  writeFileSync(`${OUT_DIR}/index.html`, html)
  console.log(`\n✓ Site gerado: ${OUT_DIR}/index.html`)
  console.log(`Lojas: ${totalLojas} | Certas: ${totalCertas} (${pctGlobal}%) | Bugadas: ${totalLojas - totalCertas}`)
  console.log('\nPor rede:')
  for (const rede of redesOrd) {
    const arr = porRede.get(rede)!
    const certos = arr.filter(l => l.status === 'CERTO').length
    console.log(`  ${rede.padEnd(18)} ${certos}/${arr.length} (${Math.round(100 * certos / arr.length)}%)`)
  }
})().catch(e => { console.error(e); process.exit(1) })
