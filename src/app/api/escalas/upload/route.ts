import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseEscalaGeral } from '@/lib/parsers/escala-geral'
import { parseEscalaZonaSul } from '@/lib/parsers/escala-zona-sul'
import { parseEscalaPax } from '@/lib/parsers/escala-pax'
import type { LinhaEscala } from '@/lib/types/escala'

export const runtime = 'nodejs'
export const maxDuration = 60

type TipoEscala = 'GERAL' | 'ZONA_SUL' | 'PAX'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const formData = await req.formData()
  const arquivo = formData.get('arquivo')
  const tipo = (formData.get('tipo') as string ?? '').toUpperCase() as TipoEscala
  const data = formData.get('data') as string  // YYYY-MM-DD
  const replace = formData.get('replace') === 'true'

  if (!(arquivo instanceof File))
    return new NextResponse('Arquivo não enviado.', { status: 400 })

  if (!['GERAL', 'ZONA_SUL', 'PAX'].includes(tipo))
    return new NextResponse('Tipo inválido. Use GERAL, ZONA_SUL ou PAX.', { status: 400 })

  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data))
    return new NextResponse('Data inválida. Use YYYY-MM-DD.', { status: 400 })

  if (!arquivo.name.toLowerCase().endsWith('.xlsx'))
    return new NextResponse('Envie um arquivo .xlsx.', { status: 400 })

  // Check for duplicate upload
  const svc = createServiceClient()
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

  const arrayBuffer = await arquivo.arrayBuffer()
  let linhas: LinhaEscala[]

  try {
    if (tipo === 'GERAL') {
      linhas = await parseEscalaGeral(arrayBuffer, data)
    } else if (tipo === 'ZONA_SUL') {
      linhas = await parseEscalaZonaSul(arrayBuffer, data)
    } else {
      linhas = await parseEscalaPax(arrayBuffer, data)
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

  // Upload to Storage
  const storagePath = `escalas-raw/${data}/${tipo.toLowerCase()}.xlsx`
  const { error: storageErr } = await svc.storage
    .from('escalas-raw')
    .upload(storagePath, Buffer.from(arrayBuffer), {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: true,
    })

  if (storageErr)
    return new NextResponse(`Erro ao salvar arquivo: ${storageErr.message}`, { status: 500 })

  // Delete existing upload if replacing
  if (existente) {
    await svc.from('escala_uploads').delete().eq('id', existente.id)
  }

  // Insert upload record
  const { data: upload, error: uploadErr } = await svc
    .from('escala_uploads')
    .insert({
      data_escala: data,
      tipo,
      arquivo_path: storagePath,
      nome_arquivo: arquivo.name,
      qtd_linhas: linhas.length,
      status: 'processado',
      uploaded_by: user.id,
    })
    .select('id')
    .single()

  if (uploadErr || !upload)
    return new NextResponse(`Erro ao registrar upload: ${uploadErr?.message}`, { status: 500 })

  // Insert escala_linhas in batches
  const BATCH = 100
  let qtdOrfas = 0

  for (let i = 0; i < linhas.length; i += BATCH) {
    const batch = linhas.slice(i, i + BATCH)
    const rows = batch.map((l) => ({
      escala_upload_id: upload.id,
      rede_id: l.rede_id,
      loja_id: null,  // resolved asynchronously by catalog
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
