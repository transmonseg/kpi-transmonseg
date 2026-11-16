import { NextRequest, NextResponse } from 'next/server'
import { hojeBR } from '@/lib/data-br'
import { periodoValido, relatorioOrdemRota } from '@/lib/kpi-romaneio/relatorio-ordem-rota-servidor'
import { resumoOrdemDashboard } from '@/lib/kpi-romaneio/relatorio-ordem-rota'
import { checarAcesso } from '../acesso'

export const runtime = 'nodejs'

// 16/11: ordem da rota dentro do Dashboard da Rio Quality (quem seguiu a
// roteirização, por placa e motorista). Versão enxuta do relatório da tela
// Ordem da rota: sem endereço/cliente nem quem subiu o arquivo.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const a = await checarAcesso(sp.get('cliente'))
  if (!a.ok) return a.resp
  if (a.cliente !== 'rioquality') return new NextResponse('Só a Rio Quality tem ordem da rota.', { status: 404 })
  const p = periodoValido(sp.get('de'), sp.get('ate'), hojeBR())
  if (typeof p === 'string') return new NextResponse(p, { status: 400 })
  return NextResponse.json(resumoOrdemDashboard(await relatorioOrdemRota(p.de, p.ate)))
}
