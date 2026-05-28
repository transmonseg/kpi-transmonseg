/**
 * Reprocessa o matcher + KPI dos dias 19, 20 e 25 usando dados JÁ
 * carregados no banco (escalas e unitrac_paradas existentes). NÃO mexe
 * com upload de arquivos.
 *
 * Útil depois de cadastrar lojas novas / corrigir lat/lng — gera KPIs
 * com a base atualizada.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { cruzaEscalaUnitrac } from '@/lib/kpi/matcher'
import { detectaAnomalias } from '@/lib/kpi/anomalia'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const FAKE_USER_ID = 'c76b6f16-a988-480b-84e9-3c2e9038559a'
const DIAS = ['2026-05-19', '2026-05-20', '2026-05-25']

async function processaDia(data: string) {
  console.log(`\n──── ${data} ────`)

  // Limpar KPIs antigos
  const { data: kpisExist } = await sb.from('kpis').select('id').eq('data', data)
  if (kpisExist?.length) {
    const kpiIds = kpisExist.map(k => k.id as string)
    const { data: rotasExist } = await sb.from('kpi_rotas').select('id').eq('data', data)
    if (rotasExist?.length) {
      await sb.from('anomalias').delete().in('kpi_rota_id', rotasExist.map(r => r.id as string))
      await sb.from('kpi_rotas').delete().eq('data', data)
    }
    await sb.from('kpi_linhas').delete().in('kpi_id', kpiIds)
    await sb.from('kpis').delete().eq('data', data)
  }

  // Carregar dados
  const { data: escalaLinhas } = await sb.from('escala_linhas')
    .select('id, rede_id, placa_norm, loja_nome_raw, loja_codigo_raw, motorista_nome, carro_ordem, data_entrega')
    .eq('data_entrega', data)

  const placas = [...new Set((escalaLinhas ?? []).filter(l => l.placa_norm).map(l => l.placa_norm as string))]

  // Paginar pra ultrapassar o limite default 1000 do PostgREST
  const paradaRows: any[] = []
  const PAGE = 1000
  let offset = 0
  while (true) {
    const { data: page } = await sb.from('unitrac_paradas')
      .select(`id, placa_norm, chegada, saida, duracao_seg, distancia_km, endereco, lat, lng, local_parada, codigo_loja, nome_loja, classificacao, loja_id, ordem, unitrac_uploads!inner(data_relatorio)`)
      .eq('unitrac_uploads.data_relatorio', data)
      .in('placa_norm', placas.length > 0 ? placas : ['__nenhuma__'])
      .order('chegada')
      .range(offset, offset + PAGE - 1)
    if (!page || page.length === 0) break
    paradaRows.push(...page)
    if (page.length < PAGE) break
    offset += PAGE
  }

  const { data: lojas } = await sb.from('lojas')
    .select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros')
    .eq('ativo', true)

  const { data: redes } = await sb.from('redes').select('id, nome, janela_inicio, janela_fim')

  const janelasRede = new Map(
    (redes ?? []).filter(r => r.janela_inicio && r.janela_fim)
      .map(r => [r.id as string, { janela_inicio: r.janela_inicio as string, janela_fim: r.janela_fim as string }])
  )

  console.log(`  escala_linhas=${(escalaLinhas ?? []).length} unitrac_paradas=${paradaRows.length} lojas=${(lojas ?? []).length}`)

  const redeIds = [...new Set((escalaLinhas ?? []).filter(l => l.rede_id).map(l => l.rede_id as string))]
  let totalRotas = 0, totalAnomalias = 0

  for (const rid of redeIds) {
    const linhasRede = (escalaLinhas ?? []).filter(l => l.rede_id === rid)
    const placasRede = new Set(linhasRede.filter(l => l.placa_norm).map(l => l.placa_norm as string))
    const paradasRede = paradaRows.filter(p => placasRede.has(p.placa_norm as string))

    const rotas = await cruzaEscalaUnitrac(
      linhasRede,
      paradasRede,
      (lojas ?? []).filter(l => l.rede_id === rid) as Parameters<typeof cruzaEscalaUnitrac>[2]
    )

    const paradasIndex = new Map<string, any[]>()
    for (const p of paradasRede) {
      const list = paradasIndex.get(p.placa_norm as string) ?? []
      list.push({ id: p.id, classificacao: p.classificacao, chegada: new Date(p.chegada as string), saida: p.saida ? new Date(p.saida as string) : null, duracao_seg: p.duracao_seg, lat: p.lat, lng: p.lng })
      paradasIndex.set(p.placa_norm as string, list)
    }

    const anomalias = detectaAnomalias({ rotas, escalaLinhas: linhasRede, paradasIndex, janelasRede, data })

    const kpiPayload = {
      data,
      rede_id: rid,
      status: 'rascunho',
      qtd_linhas: rotas.length,
      qtd_anomalias_high: anomalias.filter(a => a.severidade === 'HIGH').length,
      qtd_anomalias_medium: anomalias.filter(a => a.severidade === 'MEDIUM').length,
      qtd_anomalias_low: anomalias.filter(a => a.severidade === 'LOW').length,
      gerada_em: new Date().toISOString(),
      gerada_por: FAKE_USER_ID,
    }

    const { data: kpiNew, error: kpiErr } = await sb.from('kpis').insert(kpiPayload).select('id').single()
    if (kpiErr || !kpiNew) { console.log(`  ✗ ${rid}: ${kpiErr?.message}`); continue }
    const kpiId = kpiNew.id as string

    const rotaRows = rotas.map((r: any) => ({
      escala_linha_id: r.escala_linha_id,
      data: r.data,
      rede_id: r.rede_id,
      placa_norm: r.placa_norm,
      saida_cd: r.saida_cd?.toISOString() ?? null,
      paradas_json: r.paradas.map((p: any) => ({ parada_id: p.parada_id, loja_id: p.loja_id, nome: p.nome, chegada: p.chegada.toISOString(), saida: p.saida.toISOString(), duracao_min: p.duracao_min, classificacao: p.classificacao })),
      anomalias_codigos: [],
      status: r.status,
    }))
    if (rotaRows.length > 0) {
      const { error: rErr } = await sb.from('kpi_rotas').insert(rotaRows)
      if (rErr) { console.log(`  ✗ rotas ${rid}: ${rErr.message}`); continue }
    }

    const { data: rotasDb } = await sb.from('kpi_rotas').select('id, escala_linha_id').in('escala_linha_id', rotas.map((r: any) => r.escala_linha_id))
    const rotaIdByEscalaLinhaId = new Map((rotasDb ?? []).map(r => [r.escala_linha_id as string, r.id as string]))

    if (anomalias.length > 0) {
      const anomaliaRows = anomalias.map((a: any) => ({
        data: a.data,
        kpi_rota_id: a.kpi_rota_id ? rotaIdByEscalaLinhaId.get(a.kpi_rota_id) ?? null : null,
        parada_id: a.parada_id,
        codigo: a.codigo,
        severidade: a.severidade,
        descricao: a.descricao,
        sugestao: a.sugestao,
        payload_json: a.payload,
        status: 'pendente',
      }))
      await sb.from('anomalias').insert(anomaliaRows)
    }

    totalRotas += rotas.length
    totalAnomalias += anomalias.length
    console.log(`  ✓ ${rid.padEnd(15)} rotas=${rotas.length} anomalias=${anomalias.length}`)
  }

  console.log(`  TOTAL ${data}: rotas=${totalRotas} anomalias=${totalAnomalias}`)
}

;(async () => {
  for (const dia of DIAS) {
    await processaDia(dia)
  }
  console.log('\n✅ Reprocessamento completo')
})().catch(e => { console.error(e); process.exit(1) })
