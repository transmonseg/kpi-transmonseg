import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const { id } = await params
  const svc = createServiceClient()

  const { data: kpi, error } = await svc
    .from('kpis')
    .select('xlsx_path, pdf_path')
    .eq('id', id)
    .single()

  if (error || !kpi) return new NextResponse('KPI não encontrado', { status: 404 })

  if (!kpi.xlsx_path && !kpi.pdf_path) {
    return NextResponse.json({ xlsx_url: null, pdf_url: null })
  }

  const [xlsx, pdf] = await Promise.all([
    kpi.xlsx_path
      ? svc.storage.from('kpis-gerados').createSignedUrl(kpi.xlsx_path, 604800)
      : Promise.resolve({ data: null }),
    kpi.pdf_path
      ? svc.storage.from('kpis-gerados').createSignedUrl(kpi.pdf_path, 604800)
      : Promise.resolve({ data: null }),
  ])

  return NextResponse.json({
    xlsx_url: xlsx.data?.signedUrl ?? null,
    pdf_url: pdf.data?.signedUrl ?? null,
  })
}
