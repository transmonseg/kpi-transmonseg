import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseEscalaNutrimax } from '@/lib/kpi-nutrimax/parse-escala'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { montaResumoViagemPorPlaca } from '@/lib/kpi-nutrimax/resumo-viagem'
import { montaKpiViagemPorCarga } from '@/lib/kpi-nutrimax/kpi-viagem'
import { gerarKpiViagemXlsx } from '@/lib/kpi-nutrimax/gerador-kpi-viagem'

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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return new NextResponse('Data inválida (YYYY-MM-DD)', { status: 400 })
  if (!(escalaFile instanceof File)) return new NextResponse('Escala de Rota (PDF) obrigatória', { status: 400 })
  if (!(relatorioFile instanceof File)) return new NextResponse('Relatório Parada e Serviço (PDF) obrigatório', { status: 400 })

  const escalaBuf = Buffer.from(await escalaFile.arrayBuffer())
  const relatorioBuf = Buffer.from(await relatorioFile.arrayBuffer())

  const escala = await parseEscalaNutrimax(escalaBuf)
  if (escala.length === 0) {
    return new NextResponse('Nenhuma carga reconhecida na escala — confira se o PDF é a "Escala de Rota".', { status: 422 })
  }
  const resumosVeiculo = await parseUnitracPdf(relatorioBuf)
  if (resumosVeiculo.length === 0) {
    return new NextResponse('Nenhum veículo reconhecido no relatório — confira se o PDF é o "Relatório Parada e Serviço".', { status: 422 })
  }

  const resumoViagem = montaResumoViagemPorPlaca(resumosVeiculo)
  const kpi = montaKpiViagemPorCarga(escala, resumoViagem)
  const xlsxBuf = await gerarKpiViagemXlsx(kpi)

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
    status: k.status,
  }))

  return NextResponse.json({
    resumo,
    linhas,
    xlsxBase64: xlsxBuf.toString('base64'),
    filename: `KPI-Nutry-Max-${data}.xlsx`,
  })
}
