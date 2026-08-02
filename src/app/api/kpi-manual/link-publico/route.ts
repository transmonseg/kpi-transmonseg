// POST /api/kpi-manual/link-publico  { data, redes }
// Cria um link público (sem login) pra ver o KPI Manual de um dia/redes
// específico — pensado pra mandar pro cliente final, que não tem conta no
// sistema. O token é a própria permissão (kpi_manual_links_publicos), então
// só admin/gerente pode gerar (visualizador só enxerga, não distribui).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getPerfil, redesEfetivas } from '@/lib/perfil'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const perfil = await getPerfil(user.id)
  if (perfil.papel === 'visualizador') {
    return new NextResponse('Sem permissão para gerar link público.', { status: 403 })
  }

  const body = await req.json().catch(() => null) as { data?: string; redes?: string[] } | null
  const data = body?.data
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return new NextResponse('"data" inválida (use YYYY-MM-DD)', { status: 400 })
  }
  const redesRecebidas = Array.isArray(body?.redes) ? body.redes.filter((r): r is string => typeof r === 'string') : []
  const redes = redesEfetivas(perfil, redesRecebidas)
  if (redes.length === 0) {
    return new NextResponse('Nenhuma rede válida para gerar o link.', { status: 400 })
  }

  const svc = createServiceClient()
  const { data: link, error } = await svc
    .from('kpi_manual_links_publicos')
    .insert({ data, redes, criado_por: user.id })
    .select('token')
    .single()
  if (error) return new NextResponse(error.message, { status: 500 })

  return NextResponse.json({ token: link.token })
}
