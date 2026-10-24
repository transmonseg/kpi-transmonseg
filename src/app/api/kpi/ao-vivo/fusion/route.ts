import { NextResponse } from 'next/server'
import { acessoAoVivo } from '../acesso'
import { buscarDiaRioQualityFusion } from '@/lib/kpi-rioquality/fonte-fusion'
import { hojeBR } from '@/lib/data-br'
import { guardarDiaAoVivo, calcularAoVivo } from '@/lib/kpi-romaneio/ao-vivo-servico'
import { registrarSyncFusion } from '@/lib/kpi-rioquality/status-fusion-banco'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const url = new URL(request.url)
  const cliente = url.searchParams.get('cliente')
  const data = url.searchParams.get('data') ?? hojeBR()
  const acc = await acessoAoVivo(cliente)
  if (!acc.ok) return acc.resp
  if (acc.cliente !== 'rioquality') {
    return NextResponse.json({ ok: false, motivo: 'fonte_fusion_so_rioquality' }, { status: 400 })
  }

  // "Puxar da Fusion" e, no dia travado no envio manual, "voltar a puxar da
  // Fusion" (F2-05): a tentativa entra no status do dia, como a do tick.
  let linhas
  try {
    linhas = await buscarDiaRioQualityFusion(data)
  } catch (e) {
    await registrarSyncFusion(data, { situacao: 'erro', em: new Date().toISOString(), erro: String(e) })
    return NextResponse.json({ ok: false, motivo: 'erro_fusion', detalhe: String(e) }, { status: 502 })
  }

  if (linhas.length === 0) {
    await registrarSyncFusion(data, { situacao: 'sem_dados', em: new Date().toISOString() })
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
  await registrarSyncFusion(data, { situacao: 'ok', em: new Date().toISOString() })
  void calcularAoVivo(acc.cliente, data).catch(err => console.error('calcularAoVivo fusion', err))
  const placas = new Set(linhas.map(l => l.placaNorm)).size
  return NextResponse.json({ ok: true, nfs: linhas.length, placas, fonte: 'fusion' })
}
