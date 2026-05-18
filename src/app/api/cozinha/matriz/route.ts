import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseMatrizClientes, type ClienteMatriz } from '@/lib/parsers/cozinha-matriz'

export const runtime = 'nodejs'

const BUCKET = 'cozinha-matriz'
const FILE_KEY = 'clientes.json'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const svc = createServiceClient()
  const { data, error } = await svc.storage.from(BUCKET).download(FILE_KEY)
  if (error || !data) return NextResponse.json({ exists: false, totalClientes: 0, updatedAt: null })

  try {
    const text = await data.text()
    const clientes = JSON.parse(text) as ClienteMatriz[]
    const { data: meta } = await svc.storage.from(BUCKET).list('', { search: FILE_KEY })
    const updatedAt = meta?.[0]?.updated_at ?? null
    return NextResponse.json({ exists: true, totalClientes: clientes.length, updatedAt })
  } catch {
    return NextResponse.json({ exists: false, totalClientes: 0, updatedAt: null })
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const formData = await req.formData()
  const arquivo = formData.get('arquivo')
  if (!(arquivo instanceof File))
    return new NextResponse('Arquivo não enviado.', { status: 400 })
  if (!arquivo.name.toLowerCase().endsWith('.xlsx'))
    return new NextResponse('Envie um arquivo .xlsx.', { status: 400 })

  const buffer = await arquivo.arrayBuffer()
  let clientes: ClienteMatriz[]
  try {
    clientes = await parseMatrizClientes(buffer)
  } catch (e) {
    return new NextResponse(e instanceof Error ? e.message : 'Erro ao ler XLSX.', { status: 400 })
  }

  if (clientes.length === 0)
    return new NextResponse('Nenhum cliente encontrado no arquivo. Confirme que é a planilha de clientes.', { status: 400 })

  const svc = createServiceClient()
  const json = JSON.stringify(clientes)
  const { error } = await svc.storage
    .from(BUCKET)
    .upload(FILE_KEY, new Blob([json], { type: 'application/json' }), { upsert: true })

  if (error)
    return new NextResponse(`Erro ao salvar matriz: ${error.message}`, { status: 500 })

  return NextResponse.json({ ok: true, totalClientes: clientes.length })
}
