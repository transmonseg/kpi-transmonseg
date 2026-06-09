import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { validarCoordLoja } from '@/lib/lojas/validar-coord'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const { searchParams } = req.nextUrl
  const rede_id = searchParams.get('rede_id')
  const orfa = searchParams.get('orfa')
  const q = searchParams.get('q')
  const ativo = searchParams.get('ativo') ?? 'true'

  const svc = createServiceClient()
  let query = svc.from('lojas').select('*')

  if (ativo !== 'all') {
    query = query.eq('ativo', ativo === 'true')
  }
  if (rede_id) {
    query = query.eq('rede_id', rede_id)
  }
  if (orfa === 'true') {
    query = query.is('codigo_unitrac', null)
  }
  if (q) {
    query = query.ilike('nome', `%${q}%`)
  }

  query = query.order('nome')

  const { data, error } = await query
  if (error) return new NextResponse(error.message, { status: 500 })

  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const body = await req.json()
  const {
    rede_id, nome, nome_curto, codigo_escala, codigo_unitrac,
    nome_unitrac, lat, lng, raio_metros, entrega_d1_fixo,
  } = body

  if (!rede_id || !nome) {
    return new NextResponse('rede_id e nome são obrigatórios.', { status: 400 })
  }

  // #37: valida coord (pega lat↔lng trocada / fora da região da operação).
  const erroCoord = validarCoordLoja(lat, lng)
  if (erroCoord) return new NextResponse(erroCoord, { status: 400 })

  const svc = createServiceClient()
  const { data, error } = await svc
    .from('lojas')
    .insert({
      rede_id,
      nome,
      nome_curto: nome_curto ?? null,
      codigo_escala: codigo_escala ?? null,
      codigo_unitrac: codigo_unitrac ?? null,
      nome_unitrac: nome_unitrac ?? null,
      lat: lat ?? null,
      lng: lng ?? null,
      raio_metros: raio_metros ?? 200,
      entrega_d1_fixo: entrega_d1_fixo ?? false,
    })
    .select('id')
    .single()

  if (error) return new NextResponse(error.message, { status: 500 })

  return NextResponse.json({ id: data.id }, { status: 201 })
}
