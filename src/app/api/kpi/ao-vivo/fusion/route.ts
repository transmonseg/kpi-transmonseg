import { NextResponse } from 'next/server'
import { acessoAoVivo } from '../acesso'
import { buscarDiaRioQualityFusion } from '@/lib/kpi-rioquality/fonte-fusion'
import { guardarDiaAoVivo, calcularAoVivo } from '@/lib/kpi-romaneio/ao-vivo-servico'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const url = new URL(request.url)
  const cliente = url.searchParams.get('cliente')
  const data = url.searchParams.get('data') ?? new Date().toISOString().slice(0, 10)
  const acc = await acessoAoVivo(cliente)
  if (!acc.ok) return acc.resp
  if (acc.cliente !== 'rioquality') {
    return NextResponse.json({ ok: false, motivo: 'fonte_fusion_so_rioquality' }, { status: 400 })
  }

  let linhas
  try {
    linhas = await buscarDiaRioQualityFusion(data)
  } catch (e) {
    return NextResponse.json({ ok: false, motivo: 'erro_fusion', detalhe: String(e) }, { status: 502 })
  }

  if (linhas.length === 0) {
    return NextResponse.json({ ok: false, motivo: 'sem_dados_fusion' }, { status: 409 })
  }

  await guardarDiaAoVivo({
    cliente: acc.cliente,
    data,
    escala: [],
    romaneio: linhas,
    pao: { linhas: [], escala: [] },
    escalaEnviada: false,
    paoEnviado: false,
    enviadoPor: acc.email,
    fonte: 'fusion',
  })
  void calcularAoVivo(acc.cliente, data)
  const placas = new Set(linhas.map(l => l.placaNorm)).size
  return NextResponse.json({ ok: true, nfs: linhas.length, placas, fonte: 'fusion' })
}
