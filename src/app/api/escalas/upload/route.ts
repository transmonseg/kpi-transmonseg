import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseEscalaGeral } from '@/lib/parsers/escala-geral'
import { parseEscalaZonaSul } from '@/lib/parsers/escala-zona-sul'
import { parseEscalaPax } from '@/lib/parsers/escala-pax'
import type { LinhaEscala } from '@/lib/types/escala'

export const runtime = 'nodejs'
export const maxDuration = 120

type TipoEscala = 'GERAL' | 'ZONA_SUL' | 'PAX'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const { tipo: tipoRaw, data, storagePath, replace } = await req.json()
  const tipo = (tipoRaw as string)?.toUpperCase() as TipoEscala

  if (!['GERAL', 'ZONA_SUL', 'PAX'].includes(tipo))
    return new NextResponse('Tipo inválido. Use GERAL, ZONA_SUL ou PAX.', { status: 400 })

  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data as string))
    return new NextResponse('Data inválida. Use YYYY-MM-DD.', { status: 400 })

  if (!storagePath || typeof storagePath !== 'string')
    return new NextResponse('storagePath ausente.', { status: 400 })

  const svc = createServiceClient()

  // Check for duplicate
  const { data: existente } = await svc
    .from('escala_uploads')
    .select('id')
    .eq('data_escala', data)
    .eq('tipo', tipo)
    .single()

  if (existente && !replace)
    return new NextResponse(
      `Já existe upload de escala ${tipo} para ${data}. Use replace=true para sobrescrever.`,
      { status: 409 }
    )

  // Read file from Storage
  const { data: fileBlob, error: downloadErr } = await svc.storage
    .from('escalas-raw')
    .download(storagePath)

  if (downloadErr || !fileBlob)
    return new NextResponse(
      `Erro ao ler arquivo do storage: ${downloadErr?.message ?? 'arquivo não encontrado'}`,
      { status: 500 }
    )

  const arrayBuffer = await fileBlob.arrayBuffer()
  let linhas: LinhaEscala[]

  try {
    if (tipo === 'GERAL') {
      linhas = await parseEscalaGeral(arrayBuffer, data as string)
    } else if (tipo === 'ZONA_SUL') {
      linhas = await parseEscalaZonaSul(arrayBuffer, data as string)
    } else {
      linhas = await parseEscalaPax(arrayBuffer, data as string)
    }
  } catch (e) {
    return new NextResponse(
      e instanceof Error ? e.message : 'Erro ao parsear XLSX.',
      { status: 400 }
    )
  }

  if (linhas.length === 0)
    return new NextResponse(
      'Nenhuma linha encontrada. Confirme que o arquivo e o tipo estão corretos.',
      { status: 400 }
    )

  if (existente) {
    await svc.from('escala_uploads').delete().eq('id', existente.id)
  }

  const { data: upload, error: uploadErr } = await svc
    .from('escala_uploads')
    .insert({
      data_escala: data,
      tipo,
      arquivo_path: storagePath,
      nome_arquivo: (storagePath as string).split('/').pop() ?? 'escala.xlsx',
      qtd_linhas: linhas.length,
      status: 'processado',
      uploaded_by: user.id,
    })
    .select('id')
    .single()

  if (uploadErr || !upload)
    return new NextResponse(`Erro ao registrar upload: ${uploadErr?.message}`, { status: 500 })

  const BATCH = 100
  let qtdOrfas = 0

  for (let i = 0; i < linhas.length; i += BATCH) {
    const batch = linhas.slice(i, i + BATCH)
    const rows = batch.map((l) => ({
      escala_upload_id: upload.id,
      rede_id: l.rede_id,
      loja_id: null,
      loja_nome_raw: l.loja_nome_raw,
      loja_codigo_raw: l.loja_codigo_raw,
      placa_norm: l.placa_norm || null,
      placa_raw: l.placa_raw,
      motorista_nome: l.motorista_nome,
      motorista_codigo: l.motorista_codigo,
      tipo_carro: l.tipo_carro,
      turno: l.turno,
      carro_ordem: l.carro_ordem,
      obs: l.obs,
      restricao: l.restricao,
      peso_kg: l.peso_kg,
      paletes: l.paletes,
      data_entrega: l.data_entrega,
      raw_row_num: l.raw_row_num,
      raw_json: l,
    }))

    const { error: insertErr } = await svc.from('escala_linhas').insert(rows)
    if (insertErr)
      return new NextResponse(`Erro ao inserir linhas: ${insertErr.message}`, { status: 500 })

    qtdOrfas += batch.filter((l) => !l.placa_norm).length
  }

  return NextResponse.json({
    upload_id: upload.id,
    qtd_linhas: linhas.length,
    qtd_orfas: qtdOrfas,
  })
}
