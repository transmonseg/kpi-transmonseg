import { NextRequest, NextResponse } from 'next/server'
import { hojeBR } from '@/lib/data-br'
import { parseEscala } from '@/lib/kpi-romaneio/parse-escala'
import { parseRomaneio } from '@/lib/kpi-romaneio/parse-romaneio'
import { parsePao } from '@/lib/kpi-romaneio/parse-pao'
import { guardarDiaAoVivo, calcularAoVivo } from '@/lib/kpi-romaneio/ao-vivo-servico'
import { parseEntregasCompletas } from '@/lib/kpi-rioquality/parse-planilhas'
import { enviarAoMonitoramento } from '@/lib/kpi-romaneio/enviar-monitoramento'
import { acessoAoVivo } from '../acesso'

export const runtime = 'nodejs'

// Romaneio do dia (manhã): lê os PDFs com os MESMOS leitores da geração
// normal, guarda só o que foi lido e dispara o primeiro cálculo em segundo
// plano (a resposta não espera os ~3 min do KPI).
export async function POST(req: NextRequest) {
  const form = await req.formData()
  const a = await acessoAoVivo(String(form.get('cliente') ?? ''))
  if (!a.ok) return a.resp
  const data = hojeBR()
  // Rio Quality: um arquivo só, o Relatório de Entregas (xlsx) do dia.
  if (a.cliente === 'rioquality') {
    const arq = form.get('completo')
    if (!(arq instanceof File)) return new NextResponse('Envie o Relatório de Entregas (xlsx).', { status: 400 })
    let entregas: ReturnType<typeof parseEntregasCompletas>
    try { entregas = parseEntregasCompletas(Buffer.from(await arq.arrayBuffer())) } catch (err) {
      return new NextResponse(err instanceof Error ? err.message : 'Não consegui ler a planilha.', { status: 422 })
    }
    if (entregas.length === 0) return new NextResponse('Nenhuma entrega reconhecida — confira se é o Relatório de Entregas da Rio Quality (colunas Razão Social, Cidade, Placa, Endereço…).', { status: 422 })
    await guardarDiaAoVivo({ cliente: a.cliente, data, escala: [], romaneio: entregas, pao: { linhas: [], escala: [] }, escalaEnviada: false, paoEnviado: false, enviadoPor: a.email })
    void calcularAoVivo(a.cliente, data, m => console.log(`[kpi/ao-vivo] ${m}`)).catch(err => console.error('[kpi/ao-vivo] calculo falhou:', err))
    return NextResponse.json({ ok: true, nfs: entregas.length, placas: new Set(entregas.map(e => e.placaNorm)).size })
  }
  const romaneioFile = form.get('romaneio')
  const escalaFile = form.get('escala')
  const paoFile = form.get('romaneioPao')
  if (!(romaneioFile instanceof File)) return new NextResponse('Envie o Romaneio de Entrega (PDF).', { status: 400 })
  const romaneioBuf = Buffer.from(await romaneioFile.arrayBuffer())
  const paoBuf = paoFile instanceof File ? Buffer.from(await paoFile.arrayBuffer()) : null
  let escala: Awaited<ReturnType<typeof parseEscala>>
  let romaneio: Awaited<ReturnType<typeof parseRomaneio>>
  let pao: Awaited<ReturnType<typeof parsePao>>
  try {
    ;[escala, romaneio, pao] = await Promise.all([
      escalaFile instanceof File ? parseEscala(Buffer.from(await escalaFile.arrayBuffer())) : Promise.resolve([]),
      parseRomaneio(romaneioBuf),
      paoBuf ? parsePao(paoBuf, data) : Promise.resolve({ linhas: [], escala: [] }),
    ])
  } catch (err) {
    return new NextResponse(err instanceof Error ? err.message : 'Não consegui ler os PDFs.', { status: 422 })
  }
  if (romaneio.length === 0) {
    return new NextResponse('Nenhuma linha reconhecida no Romaneio de Entrega — confira se o PDF é o "Romaneio de Entrega" da Nutry Max.', { status: 422 })
  }
  await guardarDiaAoVivo({ cliente: a.cliente, data, escala, romaneio, pao, escalaEnviada: escalaFile instanceof File, paoEnviado: paoFile instanceof File, enviadoPor: a.email })
  void calcularAoVivo(a.cliente, data, m => console.log(`[kpi/ao-vivo] ${m}`)).catch(err => console.error('[kpi/ao-vivo] calculo falhou:', err))
  // Mesmo romaneio (e o pão, se veio) vai pro Monitoramento -- a operação não
  // sobe duas vezes.
  const monitoramento = await enviarAoMonitoramento([
    { buf: romaneioBuf, nome: romaneioFile.name || 'romaneio.pdf', origem: 'romaneio' },
    ...(paoBuf && paoFile instanceof File ? [{ buf: paoBuf, nome: paoFile.name || 'pao.pdf', origem: 'escala_pao' as const }] : []),
  ], a.email)
  for (const m of monitoramento) if (!m.ok) console.error(`[kpi/ao-vivo] envio ao monitoramento (${m.origem}) falhou: ${m.erro}`)
  const nfs = romaneio.length + pao.linhas.length
  const placas = new Set([...romaneio, ...pao.linhas].map(l => l.placa)).size
  return NextResponse.json({ ok: true, nfs, placas, monitoramento })
}
