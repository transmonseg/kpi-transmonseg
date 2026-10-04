import { NextRequest, NextResponse } from 'next/server'
import { arquivoDoDia } from '@/lib/kpi-romaneio/dashboard-kpis'
import { TIPO_XLSX } from '@/lib/kpi-romaneio/xlsx-gerado'
import { checarAcesso, dataValida } from '../acesso'

export const runtime = 'nodejs'

// GET ?cliente=&data= -> baixa a planilha inserida daquele dia.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const a = await checarAcesso(sp.get('cliente'))
  if (!a.ok) return a.resp
  const data = sp.get('data')
  if (!dataValida(data)) return new NextResponse('Data inválida', { status: 400 })
  const arq = await arquivoDoDia(a.cliente, data)
  if (!arq) return new NextResponse('Arquivo não encontrado.', { status: 404 })
  return new NextResponse(arq.buf as unknown as BodyInit, {
    headers: { 'Content-Type': TIPO_XLSX, 'Content-Disposition': `attachment; filename="${encodeURIComponent(arq.nome)}"` },
  })
}
