import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseAlteracao, normalizaPlacaAlteracao } from '@/lib/parsers/alteracao'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const svc = createServiceClient()
  const { searchParams } = new URL(req.url)
  const data = searchParams.get('data')
  const status = searchParams.get('status')

  let query = svc.from('alteracoes').select('*').order('created_at', { ascending: false })
  if (data) query = query.eq('data_alteracao', data)
  if (status) query = query.eq('status', status)

  const { data: rows, error } = await query
  if (error) return new NextResponse(error.message, { status: 500 })

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body.texto !== 'string' || !body.texto.trim())
    return new NextResponse('Campo "texto" obrigatório.', { status: 400 })
  if (!body.data || !/^\d{4}-\d{2}-\d{2}$/.test(body.data))
    return new NextResponse('Campo "data" obrigatório (YYYY-MM-DD).', { status: 400 })

  const parsed = parseAlteracao(body.texto)
  const svc = createServiceClient()

  const placaEntraNorm = parsed.entra?.placa ? normalizaPlacaAlteracao(parsed.entra.placa) : null
  const placaSaiNorm = parsed.sai?.placa ? normalizaPlacaAlteracao(parsed.sai.placa) : null

  const { data: inserted, error: insertErr } = await svc
    .from('alteracoes')
    .insert({
      data_alteracao: body.data,
      rede_id: null,
      loja_id: null,
      loja_raw: parsed.lojaRaw,
      tipo: parsed.tipo === 'BAIXA' ? 'COMUNICADO' : parsed.tipo,
      motorista_entra: parsed.entra?.nome ?? null,
      motorista_entra_codigo: parsed.entra?.cod ?? null,
      placa_entra_norm: placaEntraNorm,
      motorista_sai: parsed.sai?.nome ?? null,
      motorista_sai_codigo: parsed.sai?.cod ?? null,
      placa_sai_norm: placaSaiNorm,
      motivo: parsed.motivo,
      texto_original: body.texto,
      confianca: parsed.confianca,
      status: 'pendente',
    })
    .select('id, status, confianca')
    .single()

  if (insertErr || !inserted)
    return new NextResponse(insertErr?.message ?? 'Erro ao inserir.', { status: 500 })

  let finalStatus = inserted.status as string

  const aplicar = body.aplicar === true
  const tiposAplicaveis = ['SUBSTITUICAO', 'INCLUSAO']
  if (aplicar && parsed.confianca !== 'baixa' && tiposAplicaveis.includes(parsed.tipo)) {
    let linhaId: string | null = null

    if (placaSaiNorm) {
      const { data: porPlaca } = await svc
        .from('escala_linhas')
        .select('id')
        .eq('data_entrega', body.data)
        .eq('placa_norm', placaSaiNorm)
        .limit(1)
        .single()
      if (porPlaca) linhaId = porPlaca.id
    }

    if (!linhaId && parsed.sai?.nome) {
      const { data: porNome } = await svc
        .from('escala_linhas')
        .select('id')
        .eq('data_entrega', body.data)
        .ilike('motorista_nome', `%${parsed.sai.nome}%`)
        .limit(1)
        .single()
      if (porNome) linhaId = porNome.id
    }

    if (linhaId) {
      await svc
        .from('escala_linhas')
        .update({
          placa_norm: placaEntraNorm ?? undefined,
          motorista_nome: parsed.entra?.nome ?? undefined,
        })
        .eq('id', linhaId)

      await svc
        .from('alteracoes')
        .update({
          status: 'aplicada',
          aplicada_em: new Date().toISOString(),
          aplicada_por: user.id,
          escala_linha_id: linhaId,
        })
        .eq('id', inserted.id)

      finalStatus = 'aplicada'
    }
  }

  return NextResponse.json({ id: inserted.id, status: finalStatus, confianca: parsed.confianca, parsed })
}
