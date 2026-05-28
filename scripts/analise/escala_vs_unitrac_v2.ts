/**
 * Pra cada loja da escala, classifica APENAS pelo que o Unitrac reporta:
 *   CERTO  — placa escalada fez parada LOJA com cod_loja específico (Unitrac reconhece)
 *   BUGADO — placa só fez BASE/FORA_BASE/FAKE_EXIT (sem cod), OU cod aparece em
 *            cluster com várias outras lojas no mesmo ponto (cadastro sobreposto)
 *
 * Não usa o cadastro interno do banco — só PDF Unitrac.
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

;(async () => {
  // 1) Carrega escalas dos 3 dias
  const { data: esc } = await sb.from('escala_linhas')
    .select('rede_id, loja_nome_raw, placa_norm, data_entrega')
    .in('data_entrega', ['2026-05-19', '2026-05-20', '2026-05-25'])
    .not('placa_norm', 'is', null)

  // 2) Carrega TODAS paradas Unitrac com paginação
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

  // Index paradas por placa+dia
  function dataDe(p: any): string {
    return p.unitrac_uploads?.data_relatorio ?? p.chegada?.slice(0, 10) ?? ''
  }
  const paradasPorPlacaDia = new Map<string, any[]>()
  for (const p of paradas) {
    const key = `${p.placa_norm}|${dataDe(p)}`
    const arr = paradasPorPlacaDia.get(key) ?? []
    arr.push(p); paradasPorPlacaDia.set(key, arr)
  }

  // 3) Detecta cods em cluster cross-rede / sobreposto (≤100m, 2+ cods distintos)
  //    Pra cada cod único: mediana lat/lng
  const codStats = new Map<string, { lat: number; lng: number; nome: string }>()
  const byCod = new Map<string, { lats: number[]; lngs: number[]; nomes: Set<string> }>()
  for (const p of paradas) {
    if (p.classificacao !== 'LOJA') continue
    if (!p.codigo_loja || p.lat == null || p.lng == null) continue
    const x = byCod.get(p.codigo_loja) ?? { lats: [], lngs: [], nomes: new Set() }
    x.lats.push(p.lat); x.lngs.push(p.lng); if (p.nome_loja) x.nomes.add(p.nome_loja)
    byCod.set(p.codigo_loja, x)
  }
  for (const [cod, info] of byCod) {
    const lats = [...info.lats].sort((a, b) => a - b)
    const lngs = [...info.lngs].sort((a, b) => a - b)
    codStats.set(cod, { lat: lats[Math.floor(lats.length / 2)], lng: lngs[Math.floor(lngs.length / 2)], nome: [...info.nomes][0] ?? '?' })
  }

  // Cods sobrepostos (≤100m de outro cod) OU em região BASE
  const codsSobrepostos = new Set<string>()
  const codsNaBase = new Set<string>()
  const cods = [...codStats.keys()]
  for (const c of cods) {
    const cs = codStats.get(c)!
    if (haversine(cs.lat, cs.lng, BASE_LAT, BASE_LNG) < 1500) codsNaBase.add(c)
    for (const c2 of cods) {
      if (c === c2) continue
      const cs2 = codStats.get(c2)!
      if (haversine(cs.lat, cs.lng, cs2.lat, cs2.lng) <= 100) {
        codsSobrepostos.add(c); codsSobrepostos.add(c2)
      }
    }
  }

  // 4) Pra cada (rede, loja_nome_raw): coletar dias-escalados e verificar Unitrac
  type LojaInfo = {
    rede: string
    loja: string
    placas: Set<string>
    diasEscalado: Set<string>  // YYYY-MM-DD
    diasComParadaLojaBoa: Set<string>   // dia teve parada LOJA com cod limpo
    diasComParadaLojaBugada: Set<string> // dia teve parada LOJA com cod sobreposto/BASE
    diasSemParadaLoja: Set<string>      // dia só teve BASE/FORA_BASE
    codsBoosVistos: Set<string>
    codsBugadosVistos: Set<string>
  }
  const grupo = new Map<string, LojaInfo>()
  for (const e of esc ?? []) {
    if (!e.loja_nome_raw || !e.rede_id || !e.placa_norm || !e.data_entrega) continue
    const key = `${e.rede_id}|${e.loja_nome_raw}`
    let info = grupo.get(key)
    if (!info) {
      info = { rede: e.rede_id as string, loja: e.loja_nome_raw as string, placas: new Set(), diasEscalado: new Set(), diasComParadaLojaBoa: new Set(), diasComParadaLojaBugada: new Set(), diasSemParadaLoja: new Set(), codsBoosVistos: new Set(), codsBugadosVistos: new Set() }
      grupo.set(key, info)
    }
    info.placas.add(e.placa_norm as string)
    info.diasEscalado.add(e.data_entrega as string)

    // Olha paradas dessa placa nesse dia
    const ps = paradasPorPlacaDia.get(`${e.placa_norm}|${e.data_entrega}`) ?? []
    const lojas = ps.filter(p => p.classificacao === 'LOJA' && p.codigo_loja)
    if (lojas.length === 0) {
      info.diasSemParadaLoja.add(e.data_entrega as string)
    } else {
      let temLojaBoa = false
      for (const p of lojas) {
        const cod = p.codigo_loja as string
        if (codsSobrepostos.has(cod) || codsNaBase.has(cod)) {
          info.codsBugadosVistos.add(cod)
        } else {
          info.codsBoosVistos.add(cod)
          temLojaBoa = true
        }
      }
      if (temLojaBoa) info.diasComParadaLojaBoa.add(e.data_entrega as string)
      else info.diasComParadaLojaBugada.add(e.data_entrega as string)
    }
  }

  // 5) Classifica cada loja
  type Status = 'CERTO' | 'BUGADO'
  type Linha = { rede: string; loja: string; status: Status; obs: string; placas: number; dias: number }
  const linhas: Linha[] = []

  for (const info of grupo.values()) {
    const boas = info.diasComParadaLojaBoa.size
    const bugadas = info.diasComParadaLojaBugada.size
    const semParada = info.diasSemParadaLoja.size
    const totalDias = info.diasEscalado.size

    let status: Status, obs: string
    if (boas > 0 && boas >= bugadas) {
      // Pelo menos 1 dia teve parada LOJA com cod específico → o Unitrac reconhece essa loja
      status = 'CERTO'
      const cods = [...info.codsBoosVistos]
      obs = `${boas}/${totalDias} dias com parada LOJA cod=${cods.slice(0, 3).join(',')}`
    } else if (bugadas > 0 || info.codsBugadosVistos.size > 0) {
      // Aparece em cluster sobreposto ou na BASE → cadastro Unitrac bugado
      status = 'BUGADO'
      const cods = [...info.codsBugadosVistos]
      obs = `cod sobreposto/BASE: ${cods.slice(0, 3).join(',')}`
    } else {
      // Placa escalada nunca fez parada LOJA com cod
      status = 'BUGADO'
      obs = `placa escalada nunca fez parada LOJA com cod (${semParada}/${totalDias} dias sem parada)`
    }

    linhas.push({ rede: info.rede, loja: info.loja, status, obs, placas: info.placas.size, dias: totalDias })
  }

  // 6) Relatório
  const porRede = new Map<string, Linha[]>()
  for (const l of linhas) {
    const arr = porRede.get(l.rede) ?? []
    arr.push(l); porRede.set(l.rede, arr)
  }

  const out: string[] = [
    '# Escala × Unitrac — análise APENAS do Unitrac (sem usar cadastro interno)',
    '',
    'Pra cada loja da escala dos 3 dias (19/20/25), verifica se o Unitrac reporta',
    'parada LOJA com cod específico (CERTO) ou só BASE/FORA_BASE/cluster sobreposto (BUGADO).',
    '',
    '## Sumário por rede',
    '',
    '| Rede | ✅ CERTO | ❌ BUGADO | Total | % certo |',
    '|------|---------|-----------|-------|---------|',
  ]
  const redesOrd = [...porRede.keys()].sort((a, b) => {
    const ra = porRede.get(a)!, rb = porRede.get(b)!
    const ca = ra.filter(l => l.status === 'CERTO').length / ra.length
    const cb = rb.filter(l => l.status === 'CERTO').length / rb.length
    return cb - ca
  })
  for (const rede of redesOrd) {
    const arr = porRede.get(rede)!
    const certos = arr.filter(l => l.status === 'CERTO').length
    const pct = Math.round(100 * certos / arr.length)
    out.push(`| **${rede}** | ${certos} | ${arr.length - certos} | ${arr.length} | ${pct}% |`)
  }
  out.push('')

  for (const rede of redesOrd) {
    const arr = porRede.get(rede)!
    const certos = arr.filter(l => l.status === 'CERTO').length
    const pct = Math.round(100 * certos / arr.length)
    out.push(`## ${rede} — ${certos}/${arr.length} certas (${pct}%)`)
    out.push('')
    out.push('| Loja na escala | Status | Placas | Dias | Observação |')
    out.push('|----------------|--------|--------|------|------------|')
    const ord = arr.sort((a, b) => (a.status === 'CERTO' ? -1 : 1) - (b.status === 'CERTO' ? -1 : 1) || a.loja.localeCompare(b.loja))
    for (const l of ord) {
      const emoji = l.status === 'CERTO' ? '✅' : '❌'
      out.push(`| ${l.loja.slice(0, 60)} | ${emoji} ${l.status} | ${l.placas} | ${l.dias} | ${l.obs} |`)
    }
    out.push('')
  }

  writeFileSync('docs/conversas-tia-erica/ESCALA-VS-UNITRAC-V2.md', out.join('\n'))
  console.log(`OK → docs/conversas-tia-erica/ESCALA-VS-UNITRAC-V2.md`)
  console.log(`Total lojas: ${linhas.length}`)
  for (const rede of redesOrd) {
    const arr = porRede.get(rede)!
    const certos = arr.filter(l => l.status === 'CERTO').length
    console.log(`  ${rede.padEnd(18)} ${certos}/${arr.length} (${Math.round(100 * certos / arr.length)}%)`)
  }
})().catch(e => { console.error(e); process.exit(1) })
