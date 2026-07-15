import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseEscalaNutrimax } from '@/lib/kpi-nutrimax/parse-escala'
import { parseRomaneioNutrimax } from '@/lib/kpi-nutrimax/parse-romaneio'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { montaRelatorioPorPlaca } from '@/lib/kpi-nutrimax/romaneio-conferencia'
import { gerarRomaneioConferencia } from '@/lib/kpi-nutrimax/gerador-romaneio-conferencia'

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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return new NextResponse('Data inválida (YYYY-MM-DD)', { status: 400 })
  if (!(escalaFile instanceof File)) return new NextResponse('Escala de Rota (PDF) obrigatória', { status: 400 })
  if (!(romaneioFile instanceof File)) return new NextResponse('Romaneio de Entrega (PDF) obrigatório', { status: 400 })
  if (!(relatorioFile instanceof File)) return new NextResponse('Relatório Parada e Serviço (PDF) obrigatório', { status: 400 })

  const escalaBuf = Buffer.from(await escalaFile.arrayBuffer())
  const romaneioBuf = Buffer.from(await romaneioFile.arrayBuffer())
  const relatorioBuf = Buffer.from(await relatorioFile.arrayBuffer())

  const escala = await parseEscalaNutrimax(escalaBuf)
  if (escala.length === 0) {
    return new NextResponse('Nenhuma carga reconhecida na escala — confira se o PDF é a "Escala de Rota".', { status: 422 })
  }
  const romaneio = await parseRomaneioNutrimax(romaneioBuf)
  if (romaneio.length === 0) {
    return new NextResponse('Nenhum cliente reconhecido no romaneio — confira se o PDF é o "Romaneio de Entrega".', { status: 422 })
  }
  const resumosVeiculo = await parseUnitracPdf(relatorioBuf)
  if (resumosVeiculo.length === 0) {
    return new NextResponse('Nenhum veículo reconhecido no relatório — confira se o PDF é o "Relatório Parada e Serviço".', { status: 422 })
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

  // Prévia pra tela — sem a lista de clientes (isso fica só dentro do XLSX, evita
  // inflar o payload à toa).
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

  return NextResponse.json({
    resumo,
    linhas,
    xlsxBase64: xlsxBuf.toString('base64'),
    filename: `Romaneio-Nutry-${data}.xlsx`,
  })
}
