/**
 * GERADOR KPI BETA — MODO ESTRITO (sem geofence).
 *
 * Regra (padrões confirmados com Tia Erica / William):
 *   - Preenche SÓ se a placa escalada fez parada LOJA no Unitrac com codigo_loja
 *     que casa EXATAMENTE com o codigo_unitrac da loja cadastrada.
 *   - O código NÃO pode estar "bugado": não pode estar em cluster sobreposto
 *     (mesma coord ≤100m de outro código) nem na região da BASE Benassi.
 *   - Loja bugada ou sem cadastro → linha aparece na planilha mas VAZIA.
 *   - SEM geo-proximidade, SEM T22, SEM fallback. Só código exato e limpo.
 *
 * Gera XLSX no mesmo formato do manual (via gerador-kpi.ts) por rede/dia.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { gerarKpi, type LinhaParaKpi } from '@/lib/kpi/gerador-kpi'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const BASE_LAT = -22.828, BASE_LNG = -43.339
const OUT_DIR = 'docs/conversas-tia-erica/kpi-beta'
const DIA = process.argv[2] ?? '2026-05-19'

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const f1 = lat1 * Math.PI / 180, f2 = lat2 * Math.PI / 180
  const df = (lat2 - lat1) * Math.PI / 180, dl = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(df/2)**2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl/2)**2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
}

// Remove prefixo de rede e ruído pra comparar nome de loja escala ↔ Unitrac
const PREFIX_REDE = /\b(ASSAI|SENDAS|PREZUNIC|CARREFOUR|PRINCESA|GUANABARA|SUPERPRIX|ATACADAO|PAX|FEIRA NOVA|ARMAZEM DO GRAO|ARMAZEM GRAO|ARMAZEM|VIANENSE|MUNDIAL|ZONA SUL|EMANUEL|SAM ?S|GB|SPID|CD)\b/g
function nomeLoja(s: string): string {
  let x = norm(s)
  x = x.replace(/^\d{4,8}\s+/, '')          // tira código no início (Unitrac "560019 SENDAS ...")
  x = x.replace(PREFIX_REDE, ' ')
  x = x.replace(/\b(LOJA|FILIAL|F|RJ|SHOPPING|METRO|MERCADO|SUPER|REDE|ECONOMIA)\b/g, ' ')
  x = x.replace(/\s+/g, ' ').trim()
  return x
}
const STOP = new Set(['DO','DA','DE','DOS','DAS','I','II','III','IV','E','A','O'])
function tokens(s: string): Set<string> {
  return new Set(nomeLoja(s).split(' ').filter(t => t.length >= 2 && !STOP.has(t)))
}
// Camadas de match (do mais forte pro mais fraco)
function nomeExato(a: string, b: string): boolean {
  return nomeLoja(a) === nomeLoja(b) && nomeLoja(a).length > 0
}
// todos os tokens significativos da escala estão contidos no nome do Unitrac
function escalaContida(escala: string, unitrac: string): boolean {
  const te = tokens(escala), tu = tokens(unitrac)
  if (te.size === 0 || tu.size === 0) return false
  for (const t of te) if (!tu.has(t)) return false
  return true
}

function brtDate(iso: string): Date {
  // chega como ISO UTC; o parser já guardou BRT como UTC. Mantém UTC.
  return new Date(iso)
}

;(async () => {
  console.log(`Gerando KPI BETA estrito — ${DIA}`)

  // 1) Escalas do dia (paginação)
  const esc: any[] = []
  let o = 0
  while (true) {
    const { data: page } = await sb.from('escala_linhas')
      .select('id, rede_id, loja_nome_raw, loja_codigo_raw, placa_norm, motorista_nome, motorista_codigo, carro_ordem, data_entrega')
      .eq('data_entrega', DIA).range(o, o + 999)
    if (!page || page.length === 0) break
    esc.push(...page); if (page.length < 1000) break; o += 1000
  }

  // 2) Paradas do dia (paginação)
  const paradas: any[] = []
  o = 0
  while (true) {
    const { data: page } = await sb.from('unitrac_paradas')
      .select('placa_norm, codigo_loja, nome_loja, lat, lng, classificacao, chegada, saida, duracao_seg, unitrac_uploads!inner(data_relatorio)')
      .eq('unitrac_uploads.data_relatorio', DIA).range(o, o + 999)
    if (!page || page.length === 0) break
    paradas.push(...page); if (page.length < 1000) break; o += 1000
  }

  // 3) Cadastro de lojas
  const { data: lojasDB } = await sb.from('lojas').select('rede_id, nome, nome_unitrac, codigo_escala, codigo_unitrac, lat, lng').not('codigo_unitrac', 'is', null)

  // 4) Detecta cods BUGADOS (sobrepostos ou na BASE) — só pelo Unitrac
  const codCoord = new Map<string, { lats: number[]; lngs: number[] }>()
  for (const p of paradas) {
    if (p.classificacao !== 'LOJA' || !p.codigo_loja || p.lat == null || p.lng == null) continue
    const x = codCoord.get(p.codigo_loja) ?? { lats: [], lngs: [] }
    x.lats.push(p.lat); x.lngs.push(p.lng); codCoord.set(p.codigo_loja, x)
  }
  const codMed = new Map<string, { lat: number; lng: number }>()
  for (const [c, info] of codCoord) {
    const la = [...info.lats].sort((a, b) => a - b), lo = [...info.lngs].sort((a, b) => a - b)
    codMed.set(c, { lat: la[Math.floor(la.length/2)], lng: lo[Math.floor(lo.length/2)] })
  }
  const codsBugados = new Set<string>()
  const cods = [...codMed.keys()]
  for (const c of cods) {
    const cs = codMed.get(c)!
    if (haversine(cs.lat, cs.lng, BASE_LAT, BASE_LNG) < 1500) codsBugados.add(c)
    for (const c2 of cods) {
      if (c === c2) continue
      const cs2 = codMed.get(c2)!
      if (haversine(cs.lat, cs.lng, cs2.lat, cs2.lng) <= 100) { codsBugados.add(c); codsBugados.add(c2) }
    }
  }

  // 5) Index paradas LOJA não-bugadas por placa (com código limpo)
  const paradasPorPlaca = new Map<string, any[]>()
  for (const p of paradas) {
    if (p.classificacao !== 'LOJA' || !p.codigo_loja) continue
    if (codsBugados.has(p.codigo_loja)) continue  // pula código sobreposto/na BASE
    const arr = paradasPorPlaca.get(p.placa_norm) ?? []
    arr.push(p); paradasPorPlaca.set(p.placa_norm, arr)
  }
  // Index paradas BASE por placa (pra saída CD)
  const basePorPlaca = new Map<string, any[]>()
  for (const p of paradas) {
    if (p.classificacao !== 'BASE') continue
    const arr = basePorPlaca.get(p.placa_norm) ?? []
    arr.push(p); basePorPlaca.set(p.placa_norm, arr)
  }

  // Quantas lojas distintas a placa tem na escala (pra decidir match 1:1)
  const lojasPorPlaca = new Map<string, Set<string>>()
  for (const e of esc) {
    if (!e.placa_norm || !e.loja_nome_raw) continue
    const s = lojasPorPlaca.get(e.placa_norm) ?? new Set()
    s.add(norm(e.loja_nome_raw)); lojasPorPlaca.set(e.placa_norm, s)
  }

  // 6) Monta linhas por rede — uma linha por loja escalada
  const porRede = new Map<string, LinhaParaKpi[]>()
  let totalCertos = 0, totalVazios = 0
  const vistos = new Set<string>()

  for (const e of esc) {
    if (!e.loja_nome_raw || !e.rede_id) continue
    const dedupeKey = `${e.rede_id}|${e.loja_nome_raw}|${e.placa_norm}|${e.carro_ordem}`
    if (vistos.has(dedupeKey)) continue
    vistos.add(dedupeKey)

    let preenche = false
    let chegada: Date | null = null, saida: Date | null = null, saidaCd: Date | null = null, tempoMin: number | null = null

    if (e.placa_norm) {
      const psLimpas = paradasPorPlaca.get(e.placa_norm) ?? []
      const numLojasPlaca = (lojasPorPlaca.get(e.placa_norm) ?? new Set()).size
      let cand: any = null

      // Match em camadas (mais forte primeiro):
      //  1. nome EXATO (escala == nome reportado pelo Unitrac, sem prefixo rede)
      //  2. tokens da escala contidos no nome Unitrac
      //  3. placa de loja única → única parada limpa
      const comNome = psLimpas.filter(p => p.nome_loja)
      let casadas = comNome.filter(p => nomeExato(e.loja_nome_raw, p.nome_loja))
      if (casadas.length === 0) casadas = comNome.filter(p => escalaContida(e.loja_nome_raw, p.nome_loja))
      let grupo: any[] = []
      if (casadas.length > 0) {
        // Consolida TODAS as paradas do MESMO código casado (idas e voltas na loja)
        const codCasado = casadas.sort((a, b) => brtDate(a.chegada).getTime() - brtDate(b.chegada).getTime())[0].codigo_loja
        grupo = psLimpas.filter(p => p.codigo_loja === codCasado)
      } else if (numLojasPlaca === 1 && psLimpas.length > 0) {
        const cod = psLimpas.sort((a, b) => brtDate(a.chegada).getTime() - brtDate(b.chegada).getTime())[0].codigo_loja
        grupo = psLimpas.filter(p => p.codigo_loja === cod)
      }

      if (grupo.length > 0) {
        // chegada = PRIMEIRA chegada; saída = ÚLTIMA saída (entrega real, considera retornos)
        const ordC = [...grupo].sort((a, b) => brtDate(a.chegada).getTime() - brtDate(b.chegada).getTime())
        chegada = brtDate(ordC[0].chegada)
        const ordS = [...grupo].filter(p => p.saida).sort((a, b) => brtDate(b.saida).getTime() - brtDate(a.saida).getTime())
        saida = ordS[0] ? brtDate(ordS[0].saida) : null
        if (saida) tempoMin = Math.round((saida.getTime() - chegada.getTime()) / 60000)
        // Saída CD = última saída de BASE antes da chegada (mas se a placa só saiu
        // 1x da base no dia, usa essa saída inicial pra todas as lojas).
        const basesAntes = (basePorPlaca.get(e.placa_norm) ?? [])
          .filter(x => x.saida && brtDate(x.saida).getTime() <= chegada!.getTime())
          .sort((a, b) => brtDate(b.saida).getTime() - brtDate(a.saida).getTime())
        if (basesAntes[0]) saidaCd = brtDate(basesAntes[0].saida)
        preenche = true
      }
    }

    const arr = porRede.get(e.rede_id) ?? []
    arr.push({
      kpi_id: 'beta',
      escala_linha_id: e.id,
      ordem: arr.length + 1,
      loja_nome: e.loja_nome_raw,
      motorista: e.motorista_nome ?? null,
      motorista_codigo: e.motorista_codigo ?? null,
      placa: e.placa_norm ?? null,
      carro_ordem: (e.carro_ordem ?? 1) as 1 | 2,
      saida_cd: preenche ? saidaCd : null,
      chd_loja_1: preenche ? chegada : null,
      saida_loja_1: preenche ? saida : null,
      tempo_loja_1_min: preenche ? tempoMin : null,
      chd_loja_2: null, saida_loja_2: null, tempo_loja_2_min: null,
      chd_loja_3: null, saida_loja_3: null, tempo_loja_3_min: null,
      observacao: null,
      anomalias_codigos: [],
    })
    porRede.set(e.rede_id, arr)
    if (preenche) totalCertos++; else totalVazios++
  }

  // 8) Gera XLSX por rede
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
  for (const [rede, linhas] of porRede) {
    const buf = await gerarKpi({ rede_id: rede, data: DIA, linhas })
    writeFileSync(`${OUT_DIR}/KPI-${rede}-${DIA}-BETA.xlsx`, buf)
  }

  console.log(`\n✓ ${porRede.size} arquivos gerados em ${OUT_DIR}`)
  console.log(`  Preenchidos (CERTO): ${totalCertos}`)
  console.log(`  Vazios (bugado/sem cadastro): ${totalVazios}`)
})().catch(e => { console.error(e); process.exit(1) })
