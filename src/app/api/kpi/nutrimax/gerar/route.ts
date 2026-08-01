import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseEscalaNutrimax } from '@/lib/kpi-nutrimax/parse-escala'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { montaResumoViagemPorPlaca } from '@/lib/kpi-nutrimax/resumo-viagem'
import { montaKpiViagemPorCarga } from '@/lib/kpi-nutrimax/kpi-viagem'
import { gerarKpiViagemXlsx } from '@/lib/kpi-nutrimax/gerador-kpi-viagem'
import { MARCADOR_BASE_NUTRIMAX, foraDoAlcanceApi } from '@/lib/kpi-nutrimax/constants'
import { buscarResumosViagemViaApi, mesclarResumosPdfApi, filtraResumosPorDia } from '@/lib/kpi-nutrimax/api-paradas'
import { salvarGeracao } from '@/lib/kpi-nutrimax/historico'
import type { ResumoVeiculo } from '@/lib/types/unitrac'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const form = await req.formData()
  const data = String(form.get('data') ?? '')
  const escalaFile = form.get('escala')
  const relatorioFile = form.get('relatorio')
  const modoApi = form.get('modoApi') === 'true'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return new NextResponse('Data inválida (YYYY-MM-DD)', { status: 400 })
  if (!(escalaFile instanceof File)) return new NextResponse('Escala de Rota (PDF) obrigatória', { status: 400 })
  if (!modoApi && !(relatorioFile instanceof File)) {
    return new NextResponse('Relatório Parada e Serviço (PDF) obrigatório', { status: 400 })
  }
  if (modoApi && foraDoAlcanceApi(data)) {
    return new NextResponse(
      'Modo API só alcança as últimas 48h (hoje/ontem) — para essa data, desligue o Modo API e envie o Relatório Parada e Serviço em PDF.',
      { status: 422 },
    )
  }

  const escalaBuf = Buffer.from(await escalaFile.arrayBuffer())
  const escala = await parseEscalaNutrimax(escalaBuf)
  if (escala.length === 0) {
    return new NextResponse('Nenhuma carga reconhecida na escala — confira se o PDF é a "Escala de Rota".', { status: 422 })
  }

  const placasEscala = new Set(escala.map(e => e.placaNorm).filter(Boolean))

  let resumosVeiculo: ResumoVeiculo[]
  if (modoApi) {
    // Sem PDF pra cair de volta — se a API não trouxer nada, a geração segue
    // e o KPI reflete isso honestamente (tudo "sem_rastreador"), sem bloquear.
    resumosVeiculo = await buscarResumosViagemViaApi(placasEscala, data)
  } else {
    const relatorioBuf = Buffer.from(await (relatorioFile as File).arrayBuffer())
    const pdfResumosBrutos = await parseUnitracPdf(relatorioBuf, null, MARCADOR_BASE_NUTRIMAX)
    if (pdfResumosBrutos.length === 0) {
      return new NextResponse('Nenhum veículo reconhecido no relatório — confira se o PDF é o "Relatório Parada e Serviço".', { status: 422 })
    }
    // O Relatório costuma cobrir vários dias no mesmo PDF — filtra só as
    // paradas do dia pedido antes de seguir (ver comentário em api-paradas.ts).
    const pdfResumos = filtraResumosPorDia(pdfResumosBrutos, data)
    try {
      const apiResumos = await buscarResumosViagemViaApi(placasEscala, data)
      resumosVeiculo = apiResumos.length > 0 ? mesclarResumosPdfApi(pdfResumos, apiResumos) : pdfResumos
    } catch (e) {
      console.warn('[/api/kpi/nutrimax/gerar] enriquecimento via API falhou (segue só com o PDF):', e instanceof Error ? e.message : e)
      resumosVeiculo = pdfResumos
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
    modoApi,
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
