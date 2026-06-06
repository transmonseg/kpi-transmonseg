import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { extensaoUploadSuportada } from '@/lib/uploads/arquivo'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const { data, escalaFilename, unitracFilename } = await req.json()

  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(String(data)))
    return new NextResponse('Data inválida.', { status: 400 })
  if (!escalaFilename || !unitracFilename)
    return new NextResponse('"escalaFilename" e "unitracFilename" obrigatórios.', { status: 400 })

  const escalaExt = extensaoUploadSuportada(String(escalaFilename))
  const unitracExt = extensaoUploadSuportada(String(unitracFilename))
  if (!escalaExt || !unitracExt)
    return new NextResponse('Extensão não suportada. Use .xlsx ou .pdf.', { status: 400 })

  const ts = Date.now()

  const escalaBucketPath = `simples/${data}/escala_${ts}.${escalaExt}`
  const unitracBucketPath = `simples/${data}/unitrac_${ts}.${unitracExt}`

  const svc = createServiceClient()

  const [escalaSign, unitracSign] = await Promise.all([
    svc.storage.from('escalas-raw').createSignedUploadUrl(escalaBucketPath, { upsert: true }),
    svc.storage.from('unitrac-raw').createSignedUploadUrl(unitracBucketPath, { upsert: true }),
  ])

  if (escalaSign.error)
    return new NextResponse(`Erro presign escala: ${escalaSign.error.message}`, { status: 500 })
  if (unitracSign.error)
    return new NextResponse(`Erro presign unitrac: ${unitracSign.error.message}`, { status: 500 })

  return NextResponse.json({
    escalaSignedUrl: escalaSign.data.signedUrl,
    escalaBucketPath,
    unitracSignedUrl: unitracSign.data.signedUrl,
    unitracBucketPath,
  })
}
