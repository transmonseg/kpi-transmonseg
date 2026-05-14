import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

const TIPOS_VALIDOS = ['GERAL', 'ZONA_SUL', 'PAX']

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const { tipo, data } = await req.json()

  const tipoUp = (tipo as string)?.toUpperCase()
  if (!TIPOS_VALIDOS.includes(tipoUp))
    return new NextResponse('Tipo inválido.', { status: 400 })

  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data as string))
    return new NextResponse('Data inválida.', { status: 400 })

  const storagePath = `${data}/${tipoUp.toLowerCase()}.xlsx`
  const svc = createServiceClient()

  const { data: signed, error } = await svc.storage
    .from('escalas-raw')
    .createSignedUploadUrl(storagePath, { upsert: true })

  if (error) return new NextResponse(error.message, { status: 500 })

  return NextResponse.json({
    signedUrl: signed.signedUrl,
    token: signed.token,
    path: storagePath,
  })
}
