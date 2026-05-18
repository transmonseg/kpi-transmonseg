import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseMatrizClientes } from '@/lib/parsers/cozinha-matriz'

export const runtime = 'nodejs'
export const maxDuration = 60

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
  let clientes
  try {
    clientes = await parseMatrizClientes(buffer)
  } catch (e) {
    return new NextResponse(e instanceof Error ? e.message : 'Erro ao ler XLSX.', { status: 400 })
  }

  if (clientes.length === 0)
    return new NextResponse(
      'Nenhum cliente encontrado. Confirme que é a planilha de clientes.',
      { status: 400 }
    )

  const svc = createServiceClient()

  const BATCH = 500
  for (let i = 0; i < clientes.length; i += BATCH) {
    const lote = clientes.slice(i, i + BATCH)
    const { error } = await svc
      .from('clientes_cozinha')
      .upsert(lote, { onConflict: 'codigo', ignoreDuplicates: false })
    if (error)
      return new NextResponse(
        `Erro ao importar clientes (lote ${Math.floor(i / BATCH) + 1}): ${error.message}`,
        { status: 500 }
      )
  }

  return NextResponse.json({ ok: true, total: clientes.length })
}
