// POST /api/kpi/simples/regerar { id }
// Lê uma geração salva e re-roda o pipeline com os mesmos paths/alteracoes/line_edits.
// Retorna o mesmo shape do POST /api/kpi/simples ({ redes }).
// Não grava nova linha em kpi_simples — só regenera os arquivos pra preview/download.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getPerfil, redesEfetivas } from '@/lib/perfil'

export const runtime = 'nodejs'
export const maxDuration = 120

/** Filtra o array `redes` da resposta pelo perfil de quem pediu — defesa em
 *  profundidade: mesmo alguém com o link de uma geração inteira só recebe as
 *  redes que o próprio perfil permite (admin não é afetado). */
async function filtrarPorPerfil(userId: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const perfil = await getPerfil(userId)
  const redes = (payload.redes as Array<{ rede_id: string }> | undefined) ?? []
  const permitidas = new Set(redesEfetivas(perfil, redes.map(r => r.rede_id)))
  return { ...payload, redes: redes.filter(r => permitidas.has(r.rede_id)) }
}

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

  // Tenta servir do cache — elimina CPU de re-processamento completo.
  // O cache é gravado pelo POST /api/kpi/simples após cada geração bem-sucedida.
  try {
    const { data: cacheBlob, error: cacheErr } = await svc.storage
      .from('kpi-outputs')
      .download(`${body.id}/cache.json`)
    if (cacheBlob && !cacheErr) {
      const cached = JSON.parse(await cacheBlob.text()) as Record<string, unknown>
      console.log(`[kpi/regerar] cache hit: ${body.id}`)
      const filtrado = await filtrarPorPerfil(user.id, { ...cached, geracao_id: body.id, data: geracao.data })
      return NextResponse.json(filtrado)
    }
  } catch {
    // cache miss — segue com re-processamento normal
  }

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
  if (!res.ok) {
    const text = await res.text()
    return new NextResponse(text, { status: res.status, headers: { 'Content-Type': 'application/json' } })
  }
  const json = await res.json() as Record<string, unknown>
  const filtrado = await filtrarPorPerfil(user.id, { ...json, data: geracao.data })
  return NextResponse.json(filtrado)
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
