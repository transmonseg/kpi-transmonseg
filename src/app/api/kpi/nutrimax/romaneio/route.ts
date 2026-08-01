import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseEscalaNutrimax } from '@/lib/kpi-nutrimax/parse-escala'
import { parseRomaneioNutrimax } from '@/lib/kpi-nutrimax/parse-romaneio'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { montaRelatorioPorPlaca } from '@/lib/kpi-nutrimax/romaneio-conferencia'
import { gerarRomaneioConferencia } from '@/lib/kpi-nutrimax/gerador-romaneio-conferencia'
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
  const romaneioFile = form.get('romaneio')
  const relatorioFile = form.get('relatorio')
  const modoApi = form.get('modoApi') === 'true'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return new NextResponse('Data inválida (YYYY-MM-DD)', { status: 400 })
  if (!(escalaFile instanceof File)) return new NextResponse('Escala de Rota (PDF) obrigatória', { status: 400 })
  if (!(romaneioFile instanceof File)) return new NextResponse('Romaneio de Entrega (PDF) obrigatório', { status: 400 })
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
  const romaneioBuf = Buffer.from(await romaneioFile.arrayBuffer())

  const escala = await parseEscalaNutrimax(escalaBuf)
  if (escala.length === 0) {
    return new NextResponse('Nenhuma carga reconhecida na escala — confira se o PDF é a "Escala de Rota".', { status: 422 })
  }
  const romaneio = await parseRomaneioNutrimax(romaneioBuf)
  if (romaneio.length === 0) {
    return new NextResponse('Nenhum cliente reconhecido no romaneio — confira se o PDF é o "Romaneio de Entrega".', { status: 422 })
  }

  const placasEscala = new Set(escala.map(e => e.placaNorm).filter(Boolean))

  let resumosVeiculo: ResumoVeiculo[]
  if (modoApi) {
    // Sem PDF pra cair de volta — se a API não trouxer nada, a conferência segue
    // e o romaneio reflete isso honestamente (paradas/km em branco), sem bloquear.
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
    resumosVeiculo = pdfResumos
    try {
      const apiResumos = await buscarResumosViagemViaApi(placasEscala, data)
      if (apiResumos.length > 0) resumosVeiculo = mesclarResumosPdfApi(pdfResumos, apiResumos)
    } catch (e) {
      console.warn('[/api/kpi/nutrimax/romaneio] enriquecimento via API falhou (segue só com o PDF):', e instanceof Error ? e.message : e)
    }
  }

  const relatorio = montaRelatorioPorPlaca(escala, romaneio, resumosVeiculo)
  const xlsxBuf = await gerarRomaneioConferencia(relatorio)

  const resumo = {
    total: relatorio.length,
    ok: relatorio.filter(r => r.status === 'ok').length,
    divergentes: relatorio.filter(r => r.status === 'divergente').length,
    ausentes: relatorio.filter(r => r.status === 'ausente').length,
    pesoTotalKg: relatorio.reduce((acc, r) => acc + (r.pesoKg ?? 0), 0),
  }

  const linhas = relatorio.map(r => ({
    carga: r.carga,
    placa: r.placaNorm,
    destino: r.destino,
    motorista: r.motorista,
    pesoKg: r.pesoKg,
    nfPlanejado: r.nfPlanejado,
    nfRecebido: r.nfRecebido,
    entPlanejado: r.entPlanejado,
    entRecebido: r.entRecebido,
    kmPercorrido: r.kmPercorrido,
    qtdParadasReal: r.qtdParadasReal,
    status: r.status,
  }))

  const filename = `Romaneio-Nutry-${data}.xlsx`
  const resultado = { resumo, linhas, xlsxBase64: xlsxBuf.toString('base64'), filename }

  let geracaoId: string | null = null
  try {
    const svc = createServiceClient()
    geracaoId = await salvarGeracao(svc, {
      tipo: 'ROMANEIO',
      data,
      filename,
      resumo,
      geradoPor: user.id,
      payload: resultado,
    })
  } catch (e) {
    console.warn('[/api/kpi/nutrimax/romaneio] salvar no histórico falhou (best-effort):', e instanceof Error ? e.message : e)
  }

  return NextResponse.json({ ...resultado, geracaoId })
}
