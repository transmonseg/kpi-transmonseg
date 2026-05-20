// src/app/api/alteracoes/aplicar-lote/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import type { AlteracaoBloco } from '@/lib/parsers/alteracoes-v2.types'

export const runtime = 'nodejs'
export const maxDuration = 120

interface ReqBody {
  blocos: AlteracaoBloco[]
  data: string // YYYY-MM-DD
}

function inferirTipo(b: AlteracaoBloco): 'SUBSTITUICAO' | 'INCLUSAO' | 'COMUNICADO' {
  if (b.sai && b.entra) return 'SUBSTITUICAO'
  if (!b.sai && b.entra) return 'INCLUSAO'
  return 'COMUNICADO'
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const body = (await req.json().catch(() => null)) as ReqBody | null
  if (!body || !Array.isArray(body.blocos) || typeof body.data !== 'string')
    return new NextResponse('Body inválido: { blocos: [], data: "YYYY-MM-DD" }', { status: 400 })

  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.data))
    return new NextResponse('Data inválida (use YYYY-MM-DD)', { status: 400 })

  const svc = createServiceClient()
  const erros: Array<{ idx: number; msg: string }> = []
  const redesAfetadas = new Set<string>()

  for (let i = 0; i < body.blocos.length; i++) {
    const b = body.blocos[i]
    const payload = {
      data_alteracao: body.data,
      rede_id: b.rede_id,
      loja_raw: b.loja_nome_raw,
      tipo: inferirTipo(b),
      motorista_entra: b.entra?.motorista_nome ?? null,
      motorista_entra_codigo:
        b.entra?.motorista_codigo != null ? String(b.entra.motorista_codigo) : null,
      placa_entra_norm: b.entra?.placa_norm ?? null,
      motorista_sai: b.sai?.motorista_nome ?? null,
      motorista_sai_codigo:
        b.sai?.motorista_codigo != null ? String(b.sai.motorista_codigo) : null,
      placa_sai_norm: b.sai?.placa_norm ?? null,
      motivo: b.motivo,
      texto_original: b.raw,
      confianca: b.confianca,
      status: 'pendente',
    }
    const { error } = await svc.from('alteracoes').insert(payload)
    if (error) {
      erros.push({ idx: i, msg: error.message })
    } else if (b.rede_id) {
      redesAfetadas.add(b.rede_id)
    }
  }

  const reprocessUrl = new URL('/api/kpi/processar', req.url).toString()
  const reprocessResults = await Promise.allSettled(
    [...redesAfetadas].map((rede_id) =>
      fetch(reprocessUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: req.headers.get('cookie') ?? '',
        },
        body: JSON.stringify({ data: body.data, rede_id }),
      }),
    ),
  )

  return NextResponse.json({
    aplicados: body.blocos.length - erros.length,
    erros,
    redes_reprocessadas: [...redesAfetadas],
    reprocessar_status: reprocessResults.map((r) => r.status),
  })
}
