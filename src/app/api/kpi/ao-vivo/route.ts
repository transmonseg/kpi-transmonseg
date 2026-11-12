import { NextRequest, NextResponse } from 'next/server'
import { hojeBR } from '@/lib/data-br'
import { lerEstadoAoVivo } from '@/lib/kpi-romaneio/ao-vivo-servico'
import { lerDiaHistorico, listarDiasHistorico } from '@/lib/kpi-romaneio/ao-vivo-historico'
import { semResultadoSeIgual } from '@/lib/kpi-romaneio/ao-vivo-carga'
import { acessoAoVivo } from './acesso'
import { versaoDasRegras } from '@/lib/kpi-romaneio/versao-regras'
import { lerStatusFusion } from '@/lib/kpi-rioquality/status-fusion-banco'
import { comConferencias } from '@/lib/kpi-romaneio/ao-vivo-conferencia-servidor'
import { comOrdemRota } from '@/lib/kpi-romaneio/ordem-rota-servidor'

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
  // F2-13 (KRQ-12): versão das regras no ar -- a tela avisa quando o dia aberto
  // foi calculado com outra versão.
  const versaoRegrasAtual = versaoDasRegras()
  if (pedida && pedida !== hoje) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(pedida) || pedida > hoje) return new NextResponse('Data inválida.', { status: 400 })
    const h = await lerDiaHistorico(a.cliente, pedida)
    return NextResponse.json({
      data: pedida, hoje, historico: true, dias, clientes: a.clientes, versaoRegrasAtual,
      dia: null, calculando: false, ultimoErro: null,
      // 09/11: conferência da operação vale na hora (por cima do automático).
      resultado: await comOrdemRota(a.cliente, pedida, await comConferencias(a.cliente, pedida, h?.resultado ?? null)), fonte: h?.fonte ?? null, geracaoId: h?.geracaoId ?? null,
    })
  }
  // ?tenho=<calculadoEm>: a tela já tem esse cálculo -> não manda os ~900 KB de novo.
  // 09/11: a marca do resultado muda quando entra conferência nova.
  const lido = await lerEstadoAoVivo(a.cliente, hoje)
  const estado = semResultadoSeIgual({ ...lido, resultado: await comOrdemRota(a.cliente, hoje, await comConferencias(a.cliente, hoje, lido.resultado)) }, req.nextUrl.searchParams.get('tenho'))
  // F2-05 (KRQ-05): status da sincronizacao com a Fusion (banner da RQ).
  const fusion = a.cliente === 'rioquality' ? await lerStatusFusion(hoje) : null
  return NextResponse.json({ data: hoje, hoje, historico: false, dias, clientes: a.clientes, versaoRegrasAtual, fusion, ...estado })
}
