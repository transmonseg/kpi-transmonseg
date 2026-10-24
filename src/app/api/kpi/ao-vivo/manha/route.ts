import { NextResponse } from 'next/server'
import { hojeBR } from '@/lib/data-br'
import { lerManha } from '@/lib/kpi-romaneio/manha-servico'
import { clientesDoAoVivo } from '../acesso'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// F3-07 (ACH-04): checklist da manhã (romaneio, pão/JAC, escala, relatório da
// RQ, com o horário de chegada) e o banner do aviso interno das 06:30/07:30.
// Só os clientes que o login opera; só o dia de hoje (BRT).
export async function GET() {
  const a = await clientesDoAoVivo()
  if (!a.ok) return a.resp
  const data = hojeBR()
  try {
    const { itens, banners } = await lerManha(a.clientes, data)
    return NextResponse.json({ data, itens, banners })
  } catch (err) {
    console.error('[kpi/ao-vivo/manha] leitura falhou:', err instanceof Error ? err.message : err)
    return new NextResponse('Não consegui ler o checklist da manhã.', { status: 503 })
  }
}
