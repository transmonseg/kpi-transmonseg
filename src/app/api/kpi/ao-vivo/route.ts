import { NextRequest, NextResponse } from 'next/server'
import { hojeBR } from '@/lib/data-br'
import { lerEstadoAoVivo } from '@/lib/kpi-romaneio/ao-vivo-servico'
import { lerDiaHistorico, listarDiasHistorico } from '@/lib/kpi-romaneio/ao-vivo-historico'
import { semResultadoSeIgual } from '@/lib/kpi-romaneio/ao-vivo-carga'
import { acessoAoVivo } from './acesso'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Estado da tela ao vivo: romaneio do dia + último cálculo do KPI.
// ?data=AAAA-MM-DD de outro dia: histórico (o que ficou guardado daquele dia).
export async function GET(req: NextRequest) {
  const a = await acessoAoVivo(req.nextUrl.searchParams.get('cliente'))
  if (!a.ok) return a.resp
  const hoje = hojeBR()
  const pedida = req.nextUrl.searchParams.get('data')
  const dias = await listarDiasHistorico(a.cliente, hoje)
  if (pedida && pedida !== hoje) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(pedida) || pedida > hoje) return new NextResponse('Data inválida.', { status: 400 })
    const h = await lerDiaHistorico(a.cliente, pedida)
    return NextResponse.json({
      data: pedida, hoje, historico: true, dias, clientes: a.clientes,
      dia: null, calculando: false, ultimoErro: null,
      resultado: h?.resultado ?? null, fonte: h?.fonte ?? null, geracaoId: h?.geracaoId ?? null,
    })
  }
  // ?tenho=<calculadoEm>: a tela já tem esse cálculo -> não manda os ~900 KB de novo.
  const estado = semResultadoSeIgual(await lerEstadoAoVivo(a.cliente, hoje), req.nextUrl.searchParams.get('tenho'))
  return NextResponse.json({ data: hoje, hoje, historico: false, dias, clientes: a.clientes, ...estado })
}
