import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sugereLoja } from '@/lib/lojas/sugestao'
import type { LojaRow } from '@/lib/lojas/catalogo'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { codigo_unitrac, nome_unitrac, lat, lng, rede_id_sugerida } = body

  const svc = createServiceClient()
  const { data, error } = await svc
    .from('lojas')
    .select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros, ativo')
    .eq('ativo', true)

  if (error) return new NextResponse(error.message, { status: 500 })

  const lojas = (data ?? []) as LojaRow[]

  const sugestoes = sugereLoja({
    codigo_unitrac: codigo_unitrac ?? null,
    nome_unitrac: nome_unitrac ?? null,
    lat: lat ?? null,
    lng: lng ?? null,
    rede_id_sugerida: rede_id_sugerida ?? null,
    lojas,
  })

  return NextResponse.json({ sugestoes })
}
