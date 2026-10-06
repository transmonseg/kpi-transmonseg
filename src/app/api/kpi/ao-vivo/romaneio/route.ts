import { NextRequest, NextResponse } from 'next/server'
import { hojeBR } from '@/lib/data-br'
import { parseEscala } from '@/lib/kpi-romaneio/parse-escala'
import { parseRomaneio } from '@/lib/kpi-romaneio/parse-romaneio'
import { parsePao } from '@/lib/kpi-romaneio/parse-pao'
import { guardarDiaAoVivo, calcularAoVivo } from '@/lib/kpi-romaneio/ao-vivo-servico'
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
  const romaneioFile = form.get('romaneio')
  const escalaFile = form.get('escala')
  const paoFile = form.get('romaneioPao')
  if (!(romaneioFile instanceof File)) return new NextResponse('Envie o Romaneio de Entrega (PDF).', { status: 400 })
  let escala: Awaited<ReturnType<typeof parseEscala>>
  let romaneio: Awaited<ReturnType<typeof parseRomaneio>>
  let pao: Awaited<ReturnType<typeof parsePao>>
  try {
    ;[escala, romaneio, pao] = await Promise.all([
      escalaFile instanceof File ? parseEscala(Buffer.from(await escalaFile.arrayBuffer())) : Promise.resolve([]),
      parseRomaneio(Buffer.from(await romaneioFile.arrayBuffer())),
      paoFile instanceof File ? parsePao(Buffer.from(await paoFile.arrayBuffer()), data) : Promise.resolve({ linhas: [], escala: [] }),
    ])
  } catch (err) {
    return new NextResponse(err instanceof Error ? err.message : 'Não consegui ler os PDFs.', { status: 422 })
  }
  if (romaneio.length === 0) {
    return new NextResponse('Nenhuma linha reconhecida no Romaneio de Entrega — confira se o PDF é o "Romaneio de Entrega" da Nutry Max.', { status: 422 })
  }
  await guardarDiaAoVivo({ cliente: a.cliente, data, escala, romaneio, pao, escalaEnviada: escalaFile instanceof File, paoEnviado: paoFile instanceof File, enviadoPor: a.email })
  void calcularAoVivo(a.cliente, data, m => console.log(`[kpi/ao-vivo] ${m}`)).catch(err => console.error('[kpi/ao-vivo] calculo falhou:', err))
  const nfs = romaneio.length + pao.linhas.length
  const placas = new Set([...romaneio, ...pao.linhas].map(l => l.placa)).size
  return NextResponse.json({ ok: true, nfs, placas })
}
