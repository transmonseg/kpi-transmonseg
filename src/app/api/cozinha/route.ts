import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseCozinha, calcularEstatisticas, type ResultadoCozinha } from '@/lib/parsers/cozinha-parser'
import { gerarXlsx } from '@/lib/parsers/xlsx-generator'
import { gerarPdf } from '@/lib/parsers/pdf-generator'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return new NextResponse('Não autenticado', { status: 401 })
  }

  const formData = await req.formData()
  const arquivo = formData.get('arquivo')
  const dataRef = String(formData.get('dataRef') ?? '')

  if (!(arquivo instanceof File)) {
    return new NextResponse('Arquivo não enviado.', { status: 400 })
  }

  const nome = arquivo.name
  if (!nome.toLowerCase().endsWith('.xlsx')) {
    return new NextResponse('Envie um arquivo .xlsx.', { status: 400 })
  }

  const arrayBuffer = await arquivo.arrayBuffer()

  let resultado: ResultadoCozinha
  try {
    resultado = await parseCozinha(arrayBuffer)
  } catch (e) {
    return new NextResponse(
      e instanceof Error ? e.message : 'Erro ao ler XLSX.',
      { status: 400 }
    )
  }

  const { rotas, declaradas } = resultado

  if (rotas.length === 0) {
    return new NextResponse(
      'Nenhuma rota encontrada. Confirme que o arquivo é da escala Cozinha.',
      { status: 400 }
    )
  }

  const estatisticas = calcularEstatisticas(rotas)
  const dataFormatada = formatarData(dataRef)
  const xlsxBuffer = await gerarXlsx(rotas, estatisticas, dataFormatada)
  const pdfBuffer = await gerarPdf(rotas, estatisticas, dataFormatada)

  const nomeBase = nome.replace(/\.xlsx$/i, '')

  return NextResponse.json({
    rotas,
    estatisticas,
    declaradas,
    xlsxBase64: xlsxBuffer.toString('base64'),
    pdfBase64: pdfBuffer.toString('base64'),
    nomeBase,
  })
}

function formatarData(iso: string): string | undefined {
  if (!iso) return undefined
  const [a, m, d] = iso.split('-')
  if (!a || !m || !d) return undefined
  return `${d}/${m}/${a}`
}
