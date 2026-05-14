import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { gerarKpiXlsx } from '@/lib/kpi/gerador-xlsx'
import { gerarKpiPdf } from '@/lib/kpi/gerador-pdf'
import type { KpiLinha } from '@/lib/types/kpi'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const { kpi_id } = await req.json()
  if (!kpi_id) return new NextResponse('kpi_id obrigatório', { status: 400 })

  const svc = createServiceClient()

  const { data: kpi, error: kpiErr } = await svc
    .from('kpis')
    .select('id, data, rede_id, status, qtd_anomalias_high')
    .eq('id', kpi_id)
    .single()

  if (kpiErr || !kpi) return new NextResponse('KPI não encontrado', { status: 404 })

  if (kpi.qtd_anomalias_high > 0) {
    const { count } = await svc
      .from('anomalias')
      .select('id', { count: 'exact', head: true })
      .eq('kpi_rota_id', kpi_id)
      .eq('severidade', 'HIGH')
      .eq('status', 'pendente')

    if ((count ?? 0) > 0) {
      return new NextResponse(
        'Existem anomalias HIGH pendentes. Resolva antes de gerar.',
        { status: 422 }
      )
    }
  }

  const { data: linhasRaw, error: linhasErr } = await svc
    .from('kpi_linhas')
    .select('*')
    .eq('kpi_id', kpi_id)
    .order('ordem')

  if (linhasErr) return new NextResponse('Erro ao buscar linhas', { status: 500 })

  const linhas: KpiLinha[] = (linhasRaw ?? []).map(r => ({
    kpi_id: r.kpi_id,
    escala_linha_id: r.escala_linha_id,
    ordem: r.ordem,
    loja_nome: r.loja_nome,
    motorista: r.motorista,
    placa: r.placa,
    carro_ordem: r.carro_ordem as 1 | 2,
    saida_cd: r.saida_cd ? new Date(r.saida_cd) : null,
    chd_loja_1: r.chd_loja_1 ? new Date(r.chd_loja_1) : null,
    saida_loja_1: r.saida_loja_1 ? new Date(r.saida_loja_1) : null,
    tempo_loja_1_min: r.tempo_loja_1_min,
    chd_loja_2: r.chd_loja_2 ? new Date(r.chd_loja_2) : null,
    saida_loja_2: r.saida_loja_2 ? new Date(r.saida_loja_2) : null,
    tempo_loja_2_min: r.tempo_loja_2_min,
    chd_loja_3: r.chd_loja_3 ? new Date(r.chd_loja_3) : null,
    saida_loja_3: r.saida_loja_3 ? new Date(r.saida_loja_3) : null,
    tempo_loja_3_min: r.tempo_loja_3_min,
    observacao: r.observacao,
  }))

  const { data: rede, error: redeErr } = await svc
    .from('redes')
    .select('nome')
    .eq('id', kpi.rede_id)
    .single()

  if (redeErr || !rede) return new NextResponse('Rede não encontrada', { status: 404 })

  const [xlsxBuffer, pdfBuffer] = await Promise.all([
    gerarKpiXlsx({ rede_id: kpi.rede_id, rede_nome: rede.nome, data: kpi.data, linhas }),
    gerarKpiPdf({ rede_id: kpi.rede_id, rede_nome: rede.nome, data: kpi.data, linhas }),
  ])

  const xlsxPath = `kpis-gerados/${kpi.data}/${kpi.rede_id}.xlsx`
  const pdfPath = `kpis-gerados/${kpi.data}/${kpi.rede_id}.pdf`

  const [xlsxUpload, pdfUpload] = await Promise.all([
    svc.storage.from('kpis-gerados').upload(xlsxPath, xlsxBuffer, {
      upsert: true,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    svc.storage.from('kpis-gerados').upload(pdfPath, pdfBuffer, {
      upsert: true,
      contentType: 'application/pdf',
    }),
  ])

  if (xlsxUpload.error) return new NextResponse('Erro ao salvar XLSX', { status: 500 })
  if (pdfUpload.error) return new NextResponse('Erro ao salvar PDF', { status: 500 })

  const [xlsxSigned, pdfSigned] = await Promise.all([
    svc.storage.from('kpis-gerados').createSignedUrl(xlsxPath, 604800),
    svc.storage.from('kpis-gerados').createSignedUrl(pdfPath, 604800),
  ])

  await svc
    .from('kpis')
    .update({
      xlsx_path: xlsxPath,
      pdf_path: pdfPath,
      status: 'finalizada',
      gerada_em: new Date().toISOString(),
      gerada_por: user.id,
    })
    .eq('id', kpi_id)

  return NextResponse.json({
    xlsx_url: xlsxSigned.data?.signedUrl ?? null,
    pdf_url: pdfSigned.data?.signedUrl ?? null,
  })
}
