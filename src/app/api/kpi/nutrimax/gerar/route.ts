import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseEscalaNutrimax } from '@/lib/kpi-nutrimax/parse-escala'
import { montaResumoViagemPorPlaca } from '@/lib/kpi-nutrimax/resumo-viagem'
import { montaKpiViagemPorCarga } from '@/lib/kpi-nutrimax/kpi-viagem'
import { gerarKpiViagemXlsx } from '@/lib/kpi-nutrimax/gerador-kpi-viagem'
import { foraDoAlcanceApi } from '@/lib/kpi-nutrimax/constants'
import { buscarResumosViagemViaApi } from '@/lib/kpi-nutrimax/api-paradas'
import { enriquecerComKmReal } from '@/lib/kpi-nutrimax/km-ors'
import { salvarGeracao } from '@/lib/kpi-nutrimax/historico'

export const runtime = 'nodejs'
// 120 (não 60): o enriquecimento de KM via ORS respeita o limite de 40
// req/min do free tier — com 60-90 veículos isso pode levar mais de 1 minuto.
export const maxDuration = 120

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const form = await req.formData()
  const data = String(form.get('data') ?? '')
  const escalaFile = form.get('escala')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return new NextResponse('Data inválida (YYYY-MM-DD)', { status: 400 })
  if (!(escalaFile instanceof File)) return new NextResponse('Escala de Rota (PDF) obrigatória', { status: 400 })
  if (foraDoAlcanceApi(data)) {
    return new NextResponse(
      'A API do Unitrac só alcança as últimas 48h (hoje/ontem) — não dá pra gerar KPI de uma data mais antiga.',
      { status: 422 },
    )
  }

  const escalaBuf = Buffer.from(await escalaFile.arrayBuffer())
  const escala = await parseEscalaNutrimax(escalaBuf)
  if (escala.length === 0) {
    return new NextResponse('Nenhuma carga reconhecida na escala — confira se o PDF é a "Escala de Rota".', { status: 422 })
  }

  const placasEscala = new Set(escala.map(e => e.placaNorm).filter(Boolean))
  // Se a API não trouxer nada, a geração segue e o KPI reflete isso
  // honestamente (tudo "sem_rastreador"), sem bloquear.
  let resumosVeiculo = await buscarResumosViagemViaApi(placasEscala, data)

  const orsKey = process.env.ORS_API_KEY
  if (orsKey) {
    try {
      resumosVeiculo = await enriquecerComKmReal(resumosVeiculo, orsKey)
    } catch (e) {
      console.warn('[/api/kpi/nutrimax/gerar] cálculo de KM via ORS falhou (segue sem km):', e instanceof Error ? e.message : e)
    }
  }

  const resumoViagem = montaResumoViagemPorPlaca(resumosVeiculo)
  const kpi = montaKpiViagemPorCarga(escala, resumoViagem)
  const xlsxBuf = await gerarKpiViagemXlsx(kpi, data)

  const resumo = {
    total: kpi.length,
    ok: kpi.filter(k => k.status === 'ok').length,
    incompletos: kpi.filter(k => k.status === 'incompleto').length,
    semRastreador: kpi.filter(k => k.status === 'sem_rastreador').length,
  }

  const linhas = kpi.map(k => ({
    carga: k.carga,
    placa: k.placaNorm,
    destino: k.destino,
    motorista: k.motorista,
    pesoKg: k.pesoKg,
    entPlanejado: k.entPlanejado,
    qtdParadasReal: k.qtdParadasReal,
    kmPercorrido: k.kmPercorrido,
    inicioViagem: k.inicioViagem,
    fimViagem: k.fimViagem,
    status: k.status,
  }))

  const filename = `KPI-Nutry-Max-${data}.xlsx`
  const resultado = { resumo, linhas, xlsxBase64: xlsxBuf.toString('base64'), filename }

  let geracaoId: string | null = null
  try {
    const svc = createServiceClient()
    geracaoId = await salvarGeracao(svc, {
      tipo: 'KPI',
      data,
      filename,
      resumo,
      geradoPor: user.id,
      payload: resultado,
    })
  } catch (e) {
    console.warn('[/api/kpi/nutrimax/gerar] salvar no histórico falhou (best-effort):', e instanceof Error ? e.message : e)
  }

  return NextResponse.json({ ...resultado, geracaoId })
}
