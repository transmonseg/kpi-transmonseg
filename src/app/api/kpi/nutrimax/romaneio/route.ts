import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseEscalaNutrimax } from '@/lib/kpi-nutrimax/parse-escala'
import { parseRomaneioNutrimax } from '@/lib/kpi-nutrimax/parse-romaneio'
import { montaRelatorioPorPlaca } from '@/lib/kpi-nutrimax/romaneio-conferencia'
import { gerarRomaneioConferencia } from '@/lib/kpi-nutrimax/gerador-romaneio-conferencia'
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
  const romaneioFile = form.get('romaneio')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return new NextResponse('Data inválida (YYYY-MM-DD)', { status: 400 })
  if (!(escalaFile instanceof File)) return new NextResponse('Escala de Rota (PDF) obrigatória', { status: 400 })
  if (!(romaneioFile instanceof File)) return new NextResponse('Romaneio de Entrega (PDF) obrigatório', { status: 400 })
  if (foraDoAlcanceApi(data)) {
    return new NextResponse(
      'A API do Unitrac só alcança as últimas 48h (hoje/ontem) — não dá pra conferir uma data mais antiga.',
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
  // Se a API não trouxer nada, a conferência segue e o romaneio reflete isso
  // honestamente (paradas/km em branco), sem bloquear.
  let resumosVeiculo = await buscarResumosViagemViaApi(placasEscala, data)

  const orsKey = process.env.ORS_API_KEY
  if (orsKey) {
    try {
      resumosVeiculo = await enriquecerComKmReal(resumosVeiculo, orsKey)
    } catch (e) {
      console.warn('[/api/kpi/nutrimax/romaneio] cálculo de KM via ORS falhou (segue sem km):', e instanceof Error ? e.message : e)
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
