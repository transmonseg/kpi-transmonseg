import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const { id } = await params
  const svc = createServiceClient()

  const { data, error } = await svc
    .from('kpi_geracoes')
    .select('id, evento, gerada_em, gerada_por, qtd_linhas, qtd_anomalias_high, qtd_anomalias_medium, qtd_anomalias_low, xlsx_path, pdf_path, status, payload_json')
    .eq('kpi_id', id)
    .order('gerada_em', { ascending: false })
    .limit(50)

  if (error) return new NextResponse(error.message, { status: 500 })

  return NextResponse.json({ historico: data ?? [] })
}
