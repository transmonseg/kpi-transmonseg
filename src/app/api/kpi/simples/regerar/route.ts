// POST /api/kpi/simples/regerar { id }
// Lê uma geração salva e re-roda o pipeline com os mesmos paths/alteracoes/line_edits.
// Retorna o mesmo shape do POST /api/kpi/simples ({ redes }).
// Não grava nova linha em kpi_simples — só regenera os arquivos pra preview/download.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const body = await req.json().catch(() => null) as { id?: string } | null
  if (!body?.id) return new NextResponse('"id" obrigatório', { status: 400 })

  const svc = createServiceClient()
  const { data: geracao, error } = await svc
    .from('kpi_simples')
    .select('data, escala_paths, unitrac_path, alteracoes, line_edits')
    .eq('id', body.id)
    .maybeSingle()
  if (error || !geracao) return new NextResponse('Geração não encontrada', { status: 404 })

  // Re-encaminha pro endpoint principal com skipSave para não duplicar histórico
  const url = new URL('/api/kpi/simples', req.url).toString()
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: req.headers.get('cookie') ?? '',
    },
    body: JSON.stringify({
      escalaBucketPaths: geracao.escala_paths,
      unitracBucketPath: geracao.unitrac_path,
      data: geracao.data,
      alteracoes: geracao.alteracoes ?? [],
      lineEdits: geracao.line_edits ?? [],
      skipSave: true,
    }),
  })
  const text = await res.text()
  return new NextResponse(text, { status: res.status, headers: { 'Content-Type': 'application/json' } })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return new NextResponse('"id" obrigatório', { status: 400 })

  const svc = createServiceClient()
  const { error } = await svc.from('kpi_simples').delete().eq('id', id).eq('gerado_por', user.id)
  if (error) return new NextResponse(error.message, { status: 500 })
  return NextResponse.json({ ok: true })
}
