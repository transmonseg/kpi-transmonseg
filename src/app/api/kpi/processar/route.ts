import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { cruzaEscalaUnitrac, type GeoStore } from '@/lib/kpi/matcher'
import { detectaAnomalias } from '@/lib/kpi/anomalia'
import { normalizeForScore } from '@/lib/utils/score'
import type { RotaKpi, AnomaliaDetectada } from '@/lib/types/kpi'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const body = await req.json() as { data: string; rede_id?: string; tipo?: string }
  const { data: dataParam, rede_id, tipo } = body

  if (!dataParam || !/^\d{4}-\d{2}-\d{2}$/.test(dataParam))
    return new NextResponse('Parâmetro data inválido. Use YYYY-MM-DD.', { status: 400 })

  const svc = createServiceClient()

  // Resolve upload IDs para filtrar por tipo de escala
  let escalaUploadIds: string[] | null = null
  if (tipo) {
    const { data: uploads } = await svc
      .from('escala_uploads')
      .select('id')
      .eq('data_escala', dataParam)
      .eq('tipo', tipo.toUpperCase())
    escalaUploadIds = (uploads ?? []).map((u) => u.id as string)
    if (escalaUploadIds.length === 0)
      return new NextResponse(
        `Nenhuma escala do tipo ${tipo} encontrada para esta data.`,
        { status: 404 },
      )
  }

  // Fetch escala_linhas
  let escalaQuery = svc
    .from('escala_linhas')
    .select('id, rede_id, placa_norm, loja_nome_raw, loja_codigo_raw, motorista_nome, carro_ordem, data_entrega')
    .eq('data_entrega', dataParam)

  if (rede_id) escalaQuery = escalaQuery.eq('rede_id', rede_id)
  if (escalaUploadIds) escalaQuery = escalaQuery.in('escala_upload_id', escalaUploadIds)

  const { data: escalaLinhas, error: escalaErr } = await escalaQuery
  if (escalaErr) return new NextResponse(`Erro ao buscar escala: ${escalaErr.message}`, { status: 500 })
  if (!escalaLinhas || escalaLinhas.length === 0)
    return new NextResponse('Nenhuma linha de escala encontrada para esta data.', { status: 404 })

  // Fetch lojas (only active)
  const { data: lojas, error: lojasErr } = await svc
    .from('lojas')
    .select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros')
    .eq('ativo', true)

  if (lojasErr) return new NextResponse(`Erro ao buscar lojas: ${lojasErr.message}`, { status: 500 })

  // Fetch redes (filtra nulls para não quebrar o upsert)
  const redeIds = [...new Set(escalaLinhas.filter((l) => l.rede_id).map((l) => l.rede_id as string))]
  const { data: redes, error: redesErr } = await svc
    .from('redes')
    .select('id, nome, janela_inicio, janela_fim')
    .in('id', redeIds)

  if (redesErr) return new NextResponse(`Erro ao buscar redes: ${redesErr.message}`, { status: 500 })

  const janelasRede = new Map(
    (redes ?? [])
      .filter((r) => r.janela_inicio && r.janela_fim)
      .map((r) => [r.id as string, { janela_inicio: r.janela_inicio as string, janela_fim: r.janela_fim as string }]),
  )

  const distinctRedeIds = redeIds

  const allKpiIds: string[] = []
  let totalAnomalias = { HIGH: 0, MEDIUM: 0, LOW: 0 }

  // Fetch canonical_loja with coordinates for FORA_BASE geo fallback (Category B)
  const { data: geoStoresRaw } = await svc
    .from('canonical_loja')
    .select('id, name, lat, lng, raio_metros')
    .not('lat', 'is', null)
    .not('lng', 'is', null)

  const geoStores: GeoStore[] = (geoStoresRaw ?? []).map((g: any) => ({
    id: g.id as string,
    name: g.name as string,
    lat: g.lat as number,
    lng: g.lng as number,
    raio_metros: (g.raio_metros as number) ?? 300,
  }))

  for (const rid of distinctRedeIds) {
    const linhasRede = escalaLinhas.filter((l) => l.rede_id === rid)
    const placasRede = [...new Set(linhasRede.filter((l) => l.placa_norm).map((l) => l.placa_norm as string))]

    // Fetch paradas por rede (evita limite de 1000 linhas do Supabase quando há muitas redes)
    const { data: paradasRede, error: paradaErr } = await svc
      .from('unitrac_paradas')
      .select(`
        id, placa_norm, chegada, saida, duracao_seg, distancia_km,
        endereco, lat, lng, local_parada, codigo_loja, nome_loja,
        classificacao, loja_id, ordem,
        unitrac_uploads!inner(data_relatorio)
      `)
      .eq('unitrac_uploads.data_relatorio', dataParam)
      .in('placa_norm', placasRede.length > 0 ? placasRede : ['__nenhuma__'])
    if (paradaErr) return new NextResponse(`Erro ao buscar paradas: ${paradaErr.message}`, { status: 500 })

    const rotas = await cruzaEscalaUnitrac(
      linhasRede,
      paradasRede,
      (lojas ?? []).filter((l) => l.rede_id === rid),
      svc,
      geoStores,
    )

    // Build paradasIndex for anomalia detection
    const paradasIndex = new Map<string, Array<{
      id: string; classificacao: string; chegada: Date; saida: Date | null
      duracao_seg: number | null; lat: number | null; lng: number | null
    }>>()
    for (const p of paradasRede) {
      const list = paradasIndex.get(p.placa_norm) ?? []
      list.push({
        id: p.id as string,
        classificacao: p.classificacao as string,
        chegada: new Date(p.chegada as string),
        saida: p.saida ? new Date(p.saida as string) : null,
        duracao_seg: p.duracao_seg as number | null,
        lat: p.lat as number | null,
        lng: p.lng as number | null,
      })
      paradasIndex.set(p.placa_norm, list)
    }

    const anomalias = detectaAnomalias({
      rotas,
      escalaLinhas: linhasRede,
      paradasIndex,
      janelasRede,
      data: dataParam,
    })

    // Busca KPI existente para esta data+rede (sem depender de UNIQUE constraint)
    const { data: kpiExisting } = await svc
      .from('kpis')
      .select('id')
      .eq('data', dataParam)
      .eq('rede_id', rid)
      .maybeSingle()

    const kpiPayload = {
      data: dataParam,
      rede_id: rid,
      status: 'rascunho',
      qtd_linhas: rotas.length,
      qtd_anomalias_high: anomalias.filter((a) => a.severidade === 'HIGH').length,
      qtd_anomalias_medium: anomalias.filter((a) => a.severidade === 'MEDIUM').length,
      qtd_anomalias_low: anomalias.filter((a) => a.severidade === 'LOW').length,
      gerada_em: new Date().toISOString(),
      gerada_por: user.id,
    }

    let kpiId: string
    if (kpiExisting) {
      const { error: updErr } = await svc.from('kpis').update(kpiPayload).eq('id', kpiExisting.id)
      if (updErr)
        return new NextResponse(`Erro ao atualizar kpi: ${updErr.message}`, { status: 500 })
      kpiId = kpiExisting.id as string
    } else {
      const { data: kpiNew, error: insErr } = await svc
        .from('kpis')
        .insert(kpiPayload)
        .select('id')
        .single()
      if (insErr || !kpiNew)
        return new NextResponse(`Erro ao criar kpi: ${insErr?.message}`, { status: 500 })
      kpiId = kpiNew.id as string
    }
    allKpiIds.push(kpiId)

    // kpi_rotas: apaga registros anteriores para estas linhas e re-insere (idempotente)
    const rotaRows = rotas.map((r) => ({
      escala_linha_id: r.escala_linha_id,
      data: r.data,
      rede_id: r.rede_id,
      placa_norm: r.placa_norm,
      saida_cd: r.saida_cd?.toISOString() ?? null,
      paradas_json: r.paradas.map((p) => ({
        parada_id: p.parada_id,
        loja_id: p.loja_id,
        nome: p.nome,
        chegada: p.chegada.toISOString(),
        saida: p.saida.toISOString(),
        duracao_min: p.duracao_min,
        classificacao: p.classificacao,
      })),
      anomalias_codigos: r.anomalias_codigos,
      status: r.status,
    }))

    const escalaLinhaIds = rotaRows.map((r) => r.escala_linha_id).filter(Boolean) as string[]
    if (escalaLinhaIds.length > 0) {
      const { error: delRotaErr } = await svc
        .from('kpi_rotas')
        .delete()
        .in('escala_linha_id', escalaLinhaIds)
      if (delRotaErr)
        return new NextResponse(`Erro ao limpar kpi_rotas: ${delRotaErr.message}`, { status: 500 })
    }

    if (rotaRows.length > 0) {
      const { error: rotaErr } = await svc.from('kpi_rotas').insert(rotaRows)
      if (rotaErr)
        return new NextResponse(`Erro ao inserir kpi_rotas: ${rotaErr.message}`, { status: 500 })
    }

    // Re-fetch kpi_rota ids for anomalia linking
    const { data: rotasDb } = await svc
      .from('kpi_rotas')
      .select('id, escala_linha_id')
      .in('escala_linha_id', rotas.map((r) => r.escala_linha_id))

    const rotaIdByEscalaLinhaId = new Map(
      (rotasDb ?? []).map((r) => [r.escala_linha_id as string, r.id as string]),
    )

    // Delete existing anomalias for these kpi_rota_ids
    const kpiRotaIds = [...rotaIdByEscalaLinhaId.values()]
    if (kpiRotaIds.length > 0) {
      await svc.from('anomalias').delete().in('kpi_rota_id', kpiRotaIds)
    }

    // Insert anomalias
    if (anomalias.length > 0) {
      const anomaliaRows = anomalias.map((a) => {
        // a.kpi_rota_id stores escala_linha_id; resolve to actual kpi_rota DB id
        const rotaId = a.kpi_rota_id
          ? rotaIdByEscalaLinhaId.get(a.kpi_rota_id) ?? null
          : null
        return {
          data: a.data,
          kpi_rota_id: rotaId,
          parada_id: a.parada_id,
          codigo: a.codigo,
          severidade: a.severidade,
          descricao: a.descricao,
          sugestao: a.sugestao,
          payload_json: a.payload,
          status: 'pendente',
        }
      })

      const { error: anomErr } = await svc.from('anomalias').insert(anomaliaRows)
      if (anomErr)
        return new NextResponse(`Erro ao inserir anomalias: ${anomErr.message}`, { status: 500 })

      // Escrever anomalias_codigos de volta em kpi_rotas (para exibição no front-end)
      const codigosByRotaId = new Map<string, string[]>()
      for (const a of anomalias) {
        const rotaId = a.kpi_rota_id
          ? rotaIdByEscalaLinhaId.get(a.kpi_rota_id) ?? null
          : null
        if (!rotaId) continue
        const list = codigosByRotaId.get(rotaId) ?? []
        list.push(a.codigo)
        codigosByRotaId.set(rotaId, list)
      }
      for (const [rotaId, codigos] of codigosByRotaId) {
        await svc
          .from('kpi_rotas')
          .update({ anomalias_codigos: codigos })
          .eq('id', rotaId)
      }
    }

    // Insert unmatched routes into review_queue for manual resolution
    const reviewInserts = rotas
      .filter(r => r._matchMeta?.confidence === 'UNMATCHED' || r._matchMeta?.requiresReview === true)
      .filter(r => r.escala_linha_id)
      .map(r => {
        const nomeLoja = linhasRede.find(l => l.id === r.escala_linha_id)?.loja_nome_raw
          ?? r.paradas[0]?.nome
          ?? 'desconhecido'
        return {
          escala_linha_id: r.escala_linha_id as string,
          data: r.data,
          rede_id: r.rede_id,
          raw_name: nomeLoja,
          raw_name_norm: normalizeForScore(nomeLoja),
          matched_name: r._matchMeta?.score && r._matchMeta.score > 0
            ? (r.paradas[0]?.nome ?? null)
            : null,
          match_score: r._matchMeta?.score ?? null,
          algorithm: r._matchMeta?.algorithm ?? 'none',
          status: 'pending' as const,
        }
      })

    if (reviewInserts.length > 0) {
      // Delete existing pending rows for these escala_linha_ids before re-inserting
      // (idempotent: re-processing the same day replaces stale queue entries)
      const escalaLinhaIds = reviewInserts.map(r => r.escala_linha_id)
      await svc.from('review_queue').delete()
        .in('escala_linha_id', escalaLinhaIds)
        .eq('status', 'pending')

      const { error: qErr } = await svc
        .from('review_queue')
        .insert(reviewInserts)
      if (qErr) console.error('[review_queue] insert error:', qErr.message)
    }

    totalAnomalias.HIGH += anomalias.filter((a) => a.severidade === 'HIGH').length
    totalAnomalias.MEDIUM += anomalias.filter((a) => a.severidade === 'MEDIUM').length
    totalAnomalias.LOW += anomalias.filter((a) => a.severidade === 'LOW').length

  }

  return NextResponse.json({
    kpi_ids: allKpiIds,
    qtd_rotas: escalaLinhas.length,
    qtd_anomalias_high: totalAnomalias.HIGH,
    qtd_anomalias_medium: totalAnomalias.MEDIUM,
    qtd_anomalias_low: totalAnomalias.LOW,
  })
}
