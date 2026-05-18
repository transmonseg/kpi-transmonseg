import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const svc = createServiceClient()
  const { count, error } = await svc
    .from('clientes_cozinha')
    .select('id', { count: 'exact', head: true })

  if (error)
    return NextResponse.json({ exists: false, totalClientes: 0, updatedAt: null })

  const total = count ?? 0
  return NextResponse.json({ exists: total > 0, totalClientes: total, updatedAt: null })
}

export async function POST() {
  return new NextResponse(
    'Este endpoint foi descontinuado. Use POST /api/cozinha/clientes/importar',
    { status: 410 },
  )
}
