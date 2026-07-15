import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseEscalaNutrimax } from '@/lib/kpi-nutrimax/parse-escala'
import { parseRomaneioNutrimax } from '@/lib/kpi-nutrimax/parse-romaneio'
import { cruzaRomaneioAlvosNutrimax } from '@/lib/kpi-nutrimax/matcher'
import { checarCobertura } from '@/lib/kpi-nutrimax/cobertura'
import { gerarKpiNutrimax } from '@/lib/kpi-nutrimax/gerador'
import type { AvisoCoberturaNutrimax } from '@/lib/kpi-nutrimax/types'

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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return new NextResponse('Data inválida (YYYY-MM-DD)', { status: 400 })
  if (!(escalaFile instanceof File)) return new NextResponse('Escala de Rota (PDF) obrigatória', { status: 400 })
  if (!(romaneioFile instanceof File)) return new NextResponse('Romaneio de Entrega (PDF) obrigatório', { status: 400 })

  const escalaBuf = Buffer.from(await escalaFile.arrayBuffer())
  const romaneioBuf = Buffer.from(await romaneioFile.arrayBuffer())

  const escala = await parseEscalaNutrimax(escalaBuf)
  if (escala.length === 0) {
    return new NextResponse('Nenhuma carga reconhecida na escala — confira se o PDF é a "Escala de Rota".', { status: 422 })
  }
  const linhasRomaneio = await parseRomaneioNutrimax(romaneioBuf)
  if (linhasRomaneio.length === 0) {
    return new NextResponse('Nenhum cliente reconhecido no romaneio — confira se o PDF é o "Romaneio de Entrega".', { status: 422 })
  }

  const avisos: AvisoCoberturaNutrimax[] = checarCobertura(escala, linhasRomaneio)

  const entradas = await cruzaRomaneioAlvosNutrimax(linhasRomaneio, data)
  const xlsxBuf = await gerarKpiNutrimax(entradas)

  return NextResponse.json({
    avisos,
    xlsxBase64: xlsxBuf.toString('base64'),
    filename: `KPI-Nutry-Max-${data}.xlsx`,
  })
}
