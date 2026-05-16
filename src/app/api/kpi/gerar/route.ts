import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { gerarKpi, type LinhaParaKpi } from '@/lib/kpi/gerador-kpi'
import { gerarKpiPdf } from '@/lib/kpi/gerador-pdf'
import { consolidaKpi } from '@/lib/kpi/consolidador'
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

  // Consolida kpi_linhas a partir de kpi_rotas (idempotente — recria sempre)
  let linhasBase: KpiLinha[]
  try {
    linhasBase = await consolidaKpi({ kpi_id, data: kpi.data, rede_id: kpi.rede_id, svc })
  } catch (e) {
    return new NextResponse(
      e instanceof Error ? e.message : 'Erro ao consolidar KPI.',
      { status: 500 },
    )
  }

  if (linhasBase.length === 0)
    return new NextResponse('Nenhuma rota encontrada para este KPI.', { status: 404 })

  // Enriquecer com motorista_codigo (para XLSX)
  const escalaIds = linhasBase.map((l) => l.escala_linha_id).filter(Boolean) as string[]
  const { data: escLinhas } = await svc
    .from('escala_linhas')
    .select('id, motorista_codigo')
    .in('id', escalaIds.length ? escalaIds : ['__none__'])
  const codMap = new Map<string, string | number | null>(
    (escLinhas ?? []).map((e) => [e.id as string, (e.motorista_codigo as string | number | null) ?? null]),
  )

  // anomalias_codigos já estão em kpi_rotas — buscamos pra passar ao gerador de XLSX
  const { data: rotasComCodigos } = await svc
    .from('kpi_rotas')
    .select('escala_linha_id, anomalias_codigos')
    .eq('data', kpi.data)
    .eq('rede_id', kpi.rede_id)
  const anomMap = new Map<string, string[]>(
    (rotasComCodigos ?? []).map((r) => [
      r.escala_linha_id as string,
      (r.anomalias_codigos as string[]) ?? [],
    ]),
  )

  const linhas: LinhaParaKpi[] = linhasBase.map((l) => ({
    ...l,
    motorista_codigo: l.escala_linha_id ? (codMap.get(l.escala_linha_id) ?? null) : null,
    anomalias_codigos: l.escala_linha_id ? (anomMap.get(l.escala_linha_id) ?? []) : [],
  }))

  const { data: rede, error: redeErr } = await svc
    .from('redes')
    .select('nome')
    .eq('id', kpi.rede_id)
    .single()

  if (redeErr || !rede) return new NextResponse('Rede não encontrada', { status: 404 })

  // Carregar XLSX existente do mês (acumula abas por dia)
  const mesPath = kpi.data.slice(0, 7) // YYYY-MM
  const arquivoMesPath = `kpis-gerados/${mesPath}/${kpi.rede_id}.xlsx`
  let arquivoExistente: Buffer | null = null
  const { data: existente } = await svc.storage.from('kpis-gerados').download(arquivoMesPath)
  if (existente) arquivoExistente = Buffer.from(await existente.arrayBuffer())

  const [xlsxBuffer, pdfBuffer] = await Promise.all([
    gerarKpi({ rede_id: kpi.rede_id, data: kpi.data, linhas, arquivoExistente }),
    gerarKpiPdf({ rede_id: kpi.rede_id, rede_nome: rede.nome, data: kpi.data, linhas: linhas as KpiLinha[] }),
  ])

  // XLSX acumula no mês (1 arquivo/rede/mês), PDF é por dia
  const xlsxPath = arquivoMesPath
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
