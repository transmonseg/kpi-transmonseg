import { NextRequest, NextResponse } from 'next/server'
import { acessoAoVivo } from '../../ao-vivo/acesso'
import { buscarResolucaoPorId } from '@/lib/kpi-romaneio/resolucoes'
import { empresaDaResolucao } from '@/lib/kpi-romaneio/fila-conferir'
import { TIPO_POR_EXTENSAO } from '@/lib/kpi-romaneio/comprovante'
import { baixarComprovante } from '@/lib/kpi-romaneio/conferencia-servico'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// F3-03 (D-07): abre o comprovante anexado a uma conferência. Mesmo acesso da
// fila (operador com a empresa e admin); só da empresa pedida.
// ?cliente=nutrimax|rioquality&id=<id da resolução>
export async function GET(req: NextRequest) {
  const a = await acessoAoVivo(req.nextUrl.searchParams.get('cliente'))
  if (!a.ok) return a.resp
  const id = Number(req.nextUrl.searchParams.get('id'))
  if (!Number.isInteger(id) || id <= 0) return new NextResponse('Id inválido.', { status: 400 })
  const linha = await buscarResolucaoPorId(empresaDaResolucao(a.cliente), id)
  if (!linha?.documento) return new NextResponse('Comprovante não encontrado.', { status: 404 })
  const conteudo = await baixarComprovante(linha.documento)
  if (!conteudo) return new NextResponse('Comprovante não encontrado.', { status: 404 })
  const ext = linha.documento.split('.').pop() ?? ''
  return new NextResponse(new Uint8Array(conteudo), {
    headers: {
      'Content-Type': TIPO_POR_EXTENSAO[ext] ?? 'application/octet-stream',
      'Content-Disposition': `inline; filename="comprovante-nf-${linha.nf.replace(/[^0-9A-Za-z_-]/g, '_')}.${ext}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
