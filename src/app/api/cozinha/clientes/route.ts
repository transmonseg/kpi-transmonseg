import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

const PAGE_SIZE = 50

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const body = await req.json()
  const { codigo, fantasia, filial = '', nome = '', cnpj = '', cep = '', endereco = '', numero = '', complemento = '' } = body

  if (!codigo?.trim()) return new NextResponse('Código obrigatório.', { status: 400 })
  if (!fantasia?.trim()) return new NextResponse('Fantasia obrigatória.', { status: 400 })

  const svc = createServiceClient()
  const { data, error } = await svc
    .from('clientes_cozinha')
    .insert({ codigo: codigo.trim(), fantasia: fantasia.trim(), filial, nome, cnpj, cep, endereco, numero, complemento })
    .select()
    .single()

  if (error) return new NextResponse(error.message, { status: 400 })
  return NextResponse.json(data, { status: 201 })
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() ?? ''
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const offset = (page - 1) * PAGE_SIZE

  const svc = createServiceClient()

  const { count: semEndereco } = await svc
    .from('clientes_cozinha')
    .select('id', { count: 'exact', head: true })
    .eq('endereco', '')

  let query = svc.from('clientes_cozinha').select('*', { count: 'exact' })

  if (q) {
    query = query.or(`fantasia.ilike.%${q}%,nome.ilike.%${q}%,codigo.ilike.%${q}%`)
  }

  const { data: clientes, count, error } = await query
    .order('fantasia', { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1)

  if (error)
    return new NextResponse(`Erro ao buscar clientes: ${error.message}`, { status: 500 })

  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return NextResponse.json({
    clientes: clientes ?? [],
    total,
    semEndereco: semEndereco ?? 0,
    page,
    totalPages,
  })
}
