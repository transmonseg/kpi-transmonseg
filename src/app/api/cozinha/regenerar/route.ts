import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  type RotaCozinha,
  calcularEstatisticas,
} from '@/lib/parsers/cozinha-parser'
import { gerarXlsx } from '@/lib/parsers/xlsx-generator'
import { gerarPdf } from '@/lib/parsers/pdf-generator'

export const runtime = 'nodejs'

type Body = {
  rotas: RotaCozinha[]
  dataRef?: string
  nomeBase?: string
}

const SEM_VALOR = '—'

function classificaStatus(motorista: string, placa: string): RotaCozinha['status'] {
  const semMot = motorista === SEM_VALOR || !motorista.trim()
  const semPl = placa === SEM_VALOR || !placa.trim()
  if (semMot && semPl) return 'vazia'
  if (semMot) return 'sem-motorista'
  if (semPl) return 'sem-placa'
  return 'completa'
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return new NextResponse('Não autenticado', { status: 401 })
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return new NextResponse('JSON inválido.', { status: 400 })
  }

  if (!Array.isArray(body.rotas) || body.rotas.length === 0) {
    return new NextResponse('Lista de rotas vazia.', { status: 400 })
  }

  // Reclassifica status conforme os valores editados (motorista e placa podem ter mudado)
  const rotas: RotaCozinha[] = body.rotas.map(r => {
    const motorista = (r.motorista ?? '').trim() || SEM_VALOR
    const placa = (r.placa ?? '').trim() || SEM_VALOR
    return {
      rota: r.rota,
      motorista,
      placa,
      veiculo: r.veiculo ?? SEM_VALOR,
      duplicada: r.duplicada ?? false,
      status: classificaStatus(motorista, placa),
      clientes: r.clientes ?? [],
    }
  })

  const estatisticas = calcularEstatisticas(rotas)
  const xlsxBuffer = await gerarXlsx(rotas, estatisticas, body.dataRef)
  const pdfBuffer = await gerarPdf(rotas, estatisticas, body.dataRef)

  return NextResponse.json({
    rotas,
    estatisticas,
    xlsxBase64: xlsxBuffer.toString('base64'),
    pdfBase64: pdfBuffer.toString('base64'),
    nomeBase: body.nomeBase ?? 'ESCALA_COZINHA',
  })
}
