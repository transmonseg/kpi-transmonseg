import 'dotenv/config'
import { config as dotenvConfig } from 'dotenv'
import { resolve } from 'node:path'
import { writeFile, mkdir } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { gerarKpi } from '../src/lib/kpi/gerador-kpi.ts'

dotenvConfig({ path: resolve(process.cwd(), '.env.local') })

const data = '2026-05-15'
const out = 'C:/Users/media/Desktop/kpi-test'
await mkdir(out, { recursive: true })

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Carrega kpis da data
const { data: kpis } = await sb.from('kpis').select('rede_id').eq('data', data)
const redes = [...new Set((kpis ?? []).map(k => k.rede_id))]
console.log(`Gerando ${redes.length} KPIs pra ${data}...`)

for (const rede_id of redes) {
  // Pega kpi_rotas com anomalias_codigos
  const { data: rotas } = await sb.from('kpi_rotas')
    .select('id, escala_linha_id, placa_norm, saida_cd, paradas_json, anomalias_codigos')
    .eq('data', data).eq('rede_id', rede_id)

  if (!rotas?.length) {
    console.log(`  - ${rede_id}: sem rotas, skip`)
    continue
  }

  // Pega escala_linhas pros nomes/motoristas
  const escalaIds = rotas.map(r => r.escala_linha_id)
  const { data: escLinhas } = await sb.from('escala_linhas')
    .select('id, loja_nome_raw, motorista_nome, motorista_codigo, carro_ordem, placa_raw')
    .in('id', escalaIds.length ? escalaIds : ['__none__'])

  const escMap = new Map((escLinhas ?? []).map(e => [e.id, e]))

  // Monta LinhaParaKpi
  const linhas = rotas.map((r, idx) => {
    const e = escMap.get(r.escala_linha_id)
    const paradas = (r.paradas_json ?? [])
    const p1 = paradas[0]
    const p2 = paradas[1]
    const p3 = paradas[2]
    return {
      kpi_id: '',
      escala_linha_id: r.escala_linha_id,
      ordem: idx + 1,
      loja_nome: e?.loja_nome_raw ?? '(sem nome)',
      motorista: e?.motorista_nome ?? null,
      motorista_codigo: e?.motorista_codigo ?? null,
      placa: e?.placa_raw ?? r.placa_norm,
      carro_ordem: (e?.carro_ordem ?? 1),
      saida_cd: r.saida_cd ? new Date(r.saida_cd) : null,
      chd_loja_1: p1 ? new Date(p1.chegada) : null,
      saida_loja_1: p1 ? new Date(p1.saida) : null,
      tempo_loja_1_min: p1?.duracao_min ?? null,
      chd_loja_2: p2 ? new Date(p2.chegada) : null,
      saida_loja_2: p2 ? new Date(p2.saida) : null,
      tempo_loja_2_min: p2?.duracao_min ?? null,
      chd_loja_3: p3 ? new Date(p3.chegada) : null,
      saida_loja_3: p3 ? new Date(p3.saida) : null,
      tempo_loja_3_min: p3?.duracao_min ?? null,
      observacao: null,
      anomalias_codigos: r.anomalias_codigos ?? [],
    }
  })

  const buf = await gerarKpi({ rede_id, data, linhas })
  const fname = `KPI ${rede_id}.xlsx`
  await writeFile(`${out}/${fname}`, buf)
  const highCount = linhas.filter(l => (l.anomalias_codigos ?? []).some(c => ['ANOM-01', 'ANOM-04', 'ANOM-06', 'ANOM-07'].includes(c))).length
  console.log(`  ✓ ${rede_id}: ${linhas.length} linhas, ${highCount} com HIGH`)
}
console.log(`\n📂 Abrir: ${out}`)
