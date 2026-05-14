import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const { data } = await req.json()

  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data as string))
    return new NextResponse('Data inválida.', { status: 400 })

  const storagePath = `${data}/unitrac.xlsx`
  const svc = createServiceClient()

  try {
    const { data: signed, error } = await svc.storage
      .from('unitrac-raw')
      .createSignedUploadUrl(storagePath, { upsert: true })

    if (error) {
      console.error('[presign/unitrac] storage error:', error)
      return new NextResponse(error.message, { status: 500 })
    }

    return NextResponse.json({
      signedUrl: signed.signedUrl,
      token: signed.token,
      path: storagePath,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[presign/unitrac] unexpected error:', e)
    return new NextResponse(`Erro interno: ${msg}`, { status: 500 })
  }
}
