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

type TipoAlteracao = 'SUBSTITUICAO' | 'INCLUSAO' | 'COMUNICADO'

function inferirTipo(b: AlteracaoBloco): TipoAlteracao {
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
  const tiposAplicaveis: TipoAlteracao[] = ['SUBSTITUICAO', 'INCLUSAO']
  let blocosAplicadosEmEscala = 0

  for (let i = 0; i < body.blocos.length; i++) {
    const b = body.blocos[i]
    const tipo = inferirTipo(b)
    const placaEntraNorm = b.entra?.placa_norm ?? null
    const placaSaiNorm = b.sai?.placa_norm ?? null
    const motoristaEntraNome = b.entra?.motorista_nome ?? null
    const motoristaSaiNome = b.sai?.motorista_nome ?? null

    const payload = {
      data_alteracao: body.data,
      rede_id: b.rede_id,
      loja_raw: b.loja_nome_raw,
      tipo,
      motorista_entra: motoristaEntraNome,
      motorista_entra_codigo:
        b.entra?.motorista_codigo != null ? String(b.entra.motorista_codigo) : null,
      placa_entra_norm: placaEntraNorm,
      motorista_sai: motoristaSaiNome,
      motorista_sai_codigo:
        b.sai?.motorista_codigo != null ? String(b.sai.motorista_codigo) : null,
      placa_sai_norm: placaSaiNorm,
      motivo: b.motivo,
      texto_original: b.raw,
      confianca: b.confianca,
      status: 'pendente',
    }
    const { data: inserted, error } = await svc
      .from('alteracoes')
      .insert(payload)
      .select('id')
      .single()

    if (error || !inserted) {
      erros.push({ idx: i, msg: error?.message ?? 'falha ao inserir alteracao' })
      continue
    }

    if (b.rede_id) redesAfetadas.add(b.rede_id)

    // Tenta aplicar em escala_linhas se confiança ok e tipo aplicável
    // FIX: aplicar em TODAS as escala_linhas que casam (caminhão pode ter
    // múltiplas entregas no mesmo dia — todas precisam ser atualizadas)
    if (b.confianca !== 'baixa' && tiposAplicaveis.includes(tipo)) {
      let linhaIds: string[] = []

      // Filtro adicional: se temos filial (codigo_escala), priorizar match por loja+placa
      if (placaSaiNorm) {
        const { data: porPlaca } = await svc
          .from('escala_linhas')
          .select('id, loja_codigo_raw')
          .eq('data_entrega', body.data)
          .eq('placa_norm', placaSaiNorm)
        linhaIds = (porPlaca ?? []).map((r) => r.id as string)
      }

      // Fallback: por nome motorista (só se nada achou por placa)
      if (linhaIds.length === 0 && motoristaSaiNome) {
        const { data: porNome } = await svc
          .from('escala_linhas')
          .select('id')
          .eq('data_entrega', body.data)
          .ilike('motorista_nome', `%${motoristaSaiNome}%`)
        linhaIds = (porNome ?? []).map((r) => r.id as string)
      }

      if (linhaIds.length > 0) {
        const updatePayload: { placa_norm?: string; motorista_nome?: string } = {}
        if (placaEntraNorm) updatePayload.placa_norm = placaEntraNorm
        if (motoristaEntraNome) updatePayload.motorista_nome = motoristaEntraNome

        if (Object.keys(updatePayload).length > 0) {
          const { error: updErr } = await svc
            .from('escala_linhas')
            .update(updatePayload)
            .in('id', linhaIds)

          if (!updErr) {
            await svc
              .from('alteracoes')
              .update({
                status: 'aplicada',
                aplicada_em: new Date().toISOString(),
                aplicada_por: user.id,
                escala_linha_id: linhaIds[0], // primeira como representativa
              })
              .eq('id', inserted.id)

            blocosAplicadosEmEscala += linhaIds.length
          }
        }
      }
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
    blocos_aplicados_em_escala: blocosAplicadosEmEscala,
    redes_reprocessadas: [...redesAfetadas],
    reprocessar_status: reprocessResults.map((r) => r.status),
  })
}
