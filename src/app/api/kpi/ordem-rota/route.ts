import { NextRequest, NextResponse } from 'next/server'
import { hojeBR } from '@/lib/data-br'
import { acessoAoVivo } from '../ao-vivo/acesso'
import { periodoValido, relatorioOrdemRota } from '@/lib/kpi-romaneio/relatorio-ordem-rota-servidor'
import { gerarXlsxOrdemRota } from '@/lib/kpi-romaneio/relatorio-ordem-rota-xlsx'
import { ehRelatorioOrdemRota, parseOrdemRota } from '@/lib/kpi-rioquality/parse-ordem-rota'
import { guardarOrdemRota } from '@/lib/kpi-romaneio/ordem-rota-servidor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 12/11: tela Ordem da rota (Rio Quality). GET ?de&ate[&formato=xlsx]: o
// relatório do período; POST (arquivo): guarda o relatório das cargas com ORDEM.
export async function GET(req: NextRequest) {
  const a = await acessoAoVivo('rioquality')
  if (!a.ok) return a.resp
  const sp = req.nextUrl.searchParams
  const p = periodoValido(sp.get('de'), sp.get('ate'), hojeBR())
  if (typeof p === 'string') return new NextResponse(p, { status: 400 })
  const r = await relatorioOrdemRota(p.de, p.ate)
  if (sp.get('formato') === 'xlsx') {
    const nome = p.de === p.ate ? `ordem-da-rota-rio-quality-${p.de}.xlsx` : `ordem-da-rota-rio-quality-${p.de}-a-${p.ate}.xlsx`
    return new NextResponse(new Uint8Array(gerarXlsxOrdemRota(r)), {
      headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${nome}"` },
    })
  }
  return NextResponse.json(r)
}

export async function POST(req: NextRequest) {
  const a = await acessoAoVivo('rioquality')
  if (!a.ok) return a.resp
  const arq = (await req.formData()).get('arquivo')
  if (!(arq instanceof File)) return new NextResponse('Envie o relatório das cargas (xlsx).', { status: 400 })
  const buf = Buffer.from(await arq.arrayBuffer())
  const linhas = ehRelatorioOrdemRota(buf) ? parseOrdemRota(buf) : []
  if (linhas.length === 0) return new NextResponse('Não reconheci a ordem da rota: confira se é o "Relatório de Entregas das cargas" da Fusion, com a coluna ORDEM.', { status: 422 })
  const hoje = hojeBR()
  let dias: string[]
  try { dias = await guardarOrdemRota('rioquality', hoje, linhas, a.email, hoje) } catch (err) {
    console.error('[ordem-rota] não gravou:', err)
    return new NextResponse('Não consegui guardar a ordem da rota. Tente de novo.', { status: 500 })
  }
  console.log(`[ordem-rota] ${linhas.length} NFs (${dias.join(', ')}) por ${a.email}`)
  return NextResponse.json({ ok: true, nfs: linhas.length, placas: new Set(linhas.map(l => l.placa)).size, dias })
}
