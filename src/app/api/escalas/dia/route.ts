import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const { searchParams } = new URL(req.url)
  const data = searchParams.get('data')

  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data))
    return new NextResponse('Parâmetro data inválido. Use YYYY-MM-DD.', { status: 400 })

  const svc = createServiceClient()

  const { data: rows, error } = await svc
    .from('escala_uploads')
    .select('id, tipo, qtd_linhas, qtd_orfas, created_at')
    .eq('data_escala', data)
    .order('tipo')

  if (error) return new NextResponse(error.message, { status: 500 })

  return NextResponse.json(rows ?? [])
}
