import { NextRequest, NextResponse } from 'next/server'
import { inserirKpi } from '@/lib/kpi-romaneio/dashboard-kpis'
import { checarAcesso, dataValida } from '../acesso'

export const runtime = 'nodejs'
export const maxDuration = 120

// POST multipart (cliente, arquivo, data opcional) -> lê a planilha do KPI e
// grava no dashboard. Só admin.
export async function POST(req: NextRequest) {
  const form = await req.formData()
  const a = await checarAcesso(String(form.get('cliente') ?? ''), true)
  if (!a.ok) return a.resp
  const arquivo = form.get('arquivo')
  if (!(arquivo instanceof File)) return NextResponse.json({ ok: false, erro: 'Escolha o arquivo do KPI (.xlsx).' }, { status: 400 })
  if (!arquivo.name.toLowerCase().endsWith('.xlsx')) return NextResponse.json({ ok: false, erro: 'O arquivo precisa ser .xlsx.' }, { status: 400 })
  const dataForm = String(form.get('data') ?? '')
  const r = await inserirKpi({
    cliente: a.cliente,
    arquivo: Buffer.from(await arquivo.arrayBuffer()),
    nomeArquivo: arquivo.name,
    inseridoPor: a.email,
    dataInformada: dataValida(dataForm) ? dataForm : null,
  })
  return NextResponse.json(r, { status: r.ok ? 200 : 422 })
}
