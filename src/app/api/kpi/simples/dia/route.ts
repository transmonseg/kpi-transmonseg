// GET /api/kpi/simples/dia?data=YYYY-MM-DD
// "O KPI de um dia" — não uma geração específica. Um dia pode ter várias
// gerações (regenerações, ou redes geradas em lotes separados); mescla por
// rede_id, a geração mais recente vence. Base pro link estável que qualquer
// papel logado abre e já vê a tabela, sem passar por lista de gerações.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getPerfil, redesEfetivas } from '@/lib/perfil'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const url = new URL(req.url)
  const data = url.searchParams.get('data')
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return new NextResponse('"data" inválida (use YYYY-MM-DD)', { status: 400 })
  }

  const svc = createServiceClient()
  const { data: geracoes, error } = await svc
    .from('kpi_simples')
    .select('id, gerado_em')
    .eq('data', data)
    .order('gerado_em', { ascending: false })
  if (error) return new NextResponse(error.message, { status: 500 })

  const redesPorId = new Map<string, unknown>()
  for (const g of geracoes ?? []) {
    try {
      const { data: cacheBlob, error: cacheErr } = await svc.storage
        .from('kpi-outputs')
        .download(`${g.id}/cache.json`)
      if (!cacheBlob || cacheErr) continue
      const cached = JSON.parse(await cacheBlob.text()) as { redes?: Array<{ rede_id: string }> }
      for (const r of cached.redes ?? []) {
        // Geração mais recente primeiro (ordenado acima) — a 1ª ocorrência de
        // cada rede_id é a mais nova, não sobrescreve com uma mais velha.
        if (!redesPorId.has(r.rede_id)) redesPorId.set(r.rede_id, r)
      }
    } catch {
      // Geração sem cache legível não trava o dia inteiro — só fica de fora.
    }
  }

  const perfil = await getPerfil(user.id)
  const todasRedes = [...redesPorId.values()] as Array<{ rede_id: string }>
  const permitidas = new Set(redesEfetivas(perfil, todasRedes.map(r => r.rede_id)))
  const redes = todasRedes.filter(r => permitidas.has(r.rede_id))

  return NextResponse.json({ data, redes })
}
