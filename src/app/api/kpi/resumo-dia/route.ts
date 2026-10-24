import { NextResponse } from 'next/server'
import { hojeBR } from '@/lib/data-br'
import { acessoAoVivo } from '../ao-vivo/acesso'
import { carregarResumoDia } from '@/lib/kpi-romaneio/resumo-dia-servico'
import { gerarPdfResumoDia } from '@/lib/kpi-romaneio/resumo-dia-pdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// F3-02 (ACH-03) / F3-09: Resumo do dia por regra, sem LLM. Só leitura: devolve
// o resumo (JSON) ou o PDF para baixar. Nenhum envio a cliente sai daqui.
// ?cliente=nutrimax|rioquality&data=AAAA-MM-DD[&formato=pdf]
export async function GET(req: Request) {
  const url = new URL(req.url)
  const a = await acessoAoVivo(url.searchParams.get('cliente'))
  if (!a.ok) return a.resp
  const hoje = hojeBR()
  const data = url.searchParams.get('data') || hoje
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data > hoje) return new NextResponse('Data inválida.', { status: 400 })
  const c = await carregarResumoDia(a.cliente, data)
  if (!c) return NextResponse.json({ erro: 'Nada calculado nem guardado deste dia.' }, { status: 404 })
  if (url.searchParams.get('formato') === 'pdf') {
    const pdf = await gerarPdfResumoDia(c.resumo, c.nomeCliente)
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="resumo-${a.cliente}-${data}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  }
  return NextResponse.json({ ...c, clientes: a.clientes, hoje })
}
