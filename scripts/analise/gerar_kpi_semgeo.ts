/**
 * Gera KPIs usando o MATCHER REAL de produção (cruzaEscalaUnitrac) com geofence
 * DESLIGADO (setSemGeo). Mantém match por código/nome/placa; lojas com cadastro
 * Unitrac bugado deixam de casar e ficam vazias. Gera XLSX por rede.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { cruzaEscalaUnitrac, setSemGeo } from '@/lib/kpi/matcher'
import { gerarKpi, type LinhaParaKpi } from '@/lib/kpi/gerador-kpi'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const OUT_DIR = 'docs/conversas-tia-erica/kpi-beta'
const DIA = process.argv[2] ?? '2026-05-19'

;(async () => {
  setSemGeo(true)
  console.log(`Gerando KPI SEM GEOFENCE (matcher real) — ${DIA}`)

  // Escala (paginada)
  const esc: any[] = []
  let o = 0
  while (true) {
    const { data: page } = await sb.from('escala_linhas')
      .select('id, rede_id, placa_norm, loja_nome_raw, loja_codigo_raw, motorista_nome, motorista_codigo, carro_ordem, data_entrega')
      .eq('data_entrega', DIA).range(o, o + 999)
    if (!page || page.length === 0) break
    esc.push(...page); if (page.length < 1000) break; o += 1000
  }

  // Paradas (paginada)
  const paradas: any[] = []
  o = 0
  while (true) {
    const { data: page } = await sb.from('unitrac_paradas')
      .select('id, placa_norm, chegada, saida, duracao_seg, distancia_km, endereco, lat, lng, local_parada, codigo_loja, nome_loja, classificacao, loja_id, ordem, unitrac_uploads!inner(data_relatorio)')
      .eq('unitrac_uploads.data_relatorio', DIA).order('chegada').range(o, o + 999)
    if (!page || page.length === 0) break
    paradas.push(...page); if (page.length < 1000) break; o += 1000
  }

  // Lojas
  const { data: lojas } = await sb.from('lojas')
    .select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros')
    .eq('ativo', true)

  const redeIds = [...new Set(esc.filter(l => l.rede_id).map(l => l.rede_id as string))]
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

  let totalPreenchido = 0, totalVazio = 0
  for (const rid of redeIds) {
    const linhasRede = esc.filter(l => l.rede_id === rid)
    const placasRede = new Set(linhasRede.filter(l => l.placa_norm).map(l => l.placa_norm as string))
    const paradasRede = paradas.filter(p => placasRede.has(p.placa_norm))

    const rotas = await cruzaEscalaUnitrac(
      linhasRede,
      paradasRede,
      (lojas ?? []).filter(l => l.rede_id === rid) as Parameters<typeof cruzaEscalaUnitrac>[2],
    )

    // RotaKpi → LinhaParaKpi (1ª/2ª/3ª parada)
    const escById = new Map(linhasRede.map(l => [l.id, l]))
    const linhas: LinhaParaKpi[] = rotas.map((r: any, idx: number) => {
      const e = escById.get(r.escala_linha_id)
      const ps = (r.paradas ?? []) as any[]
      const p1 = ps[0], p2 = ps[1], p3 = ps[2]
      if (ps.length > 0) totalPreenchido++; else totalVazio++
      return {
        kpi_id: 'beta', escala_linha_id: r.escala_linha_id, ordem: idx + 1,
        loja_nome: e?.loja_nome_raw ?? '', motorista: e?.motorista_nome ?? null,
        motorista_codigo: e?.motorista_codigo ?? null, placa: r.placa_norm ?? null,
        carro_ordem: (e?.carro_ordem ?? 1) as 1 | 2,
        saida_cd: r.saida_cd ?? null,
        chd_loja_1: p1 ? new Date(p1.chegada) : null, saida_loja_1: p1 ? new Date(p1.saida) : null, tempo_loja_1_min: p1?.duracao_min ?? null,
        chd_loja_2: p2 ? new Date(p2.chegada) : null, saida_loja_2: p2 ? new Date(p2.saida) : null, tempo_loja_2_min: p2?.duracao_min ?? null,
        chd_loja_3: p3 ? new Date(p3.chegada) : null, saida_loja_3: p3 ? new Date(p3.saida) : null, tempo_loja_3_min: p3?.duracao_min ?? null,
        observacao: null, anomalias_codigos: [],
      }
    })

    const buf = await gerarKpi({ rede_id: rid, data: DIA, linhas })
    writeFileSync(`${OUT_DIR}/KPI-${rid}-${DIA}-BETA.xlsx`, buf)
  }

  console.log(`\n✓ ${redeIds.length} arquivos em ${OUT_DIR}`)
  console.log(`  Rotas com parada (preenchidas): ${totalPreenchido}`)
  console.log(`  Rotas vazias: ${totalVazio}`)
})().catch(e => { console.error(e); process.exit(1) })
