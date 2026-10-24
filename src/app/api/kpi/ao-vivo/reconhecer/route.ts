import { NextRequest, NextResponse } from 'next/server'
import { hojeBR } from '@/lib/data-br'
import { reconhecerArquivo, cabeNoAoVivo, type ArquivoNoRecibo } from '@/lib/kpi-romaneio/reconhecer-arquivo'
import { acessoAoVivo } from '../acesso'

export const runtime = 'nodejs'

const MAX_ARQUIVOS = 8
const NOME_CLIENTE = { nutrimax: 'Nutry Max', rioquality: 'Rio Quality' } as const

// F3-06 (ING-10): "Solte os arquivos do dia" -- diz o que cada arquivo é
// (pela assinatura do documento) antes do envio. Só lê, não grava nada.
export async function POST(req: NextRequest) {
  const form = await req.formData()
  const a = await acessoAoVivo(String(form.get('cliente') ?? ''))
  if (!a.ok) return a.resp
  const arquivos = form.getAll('arquivos').filter((f): f is File => f instanceof File).slice(0, MAX_ARQUIVOS)
  if (arquivos.length === 0) return new NextResponse('Escolha pelo menos um arquivo.', { status: 400 })
  const hoje = hojeBR()
  const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
  const lidos = await Promise.all(arquivos.map(async f => reconhecerArquivo(Buffer.from(await f.arrayBuffer()), f.name || 'arquivo')))
  const resposta: ArquivoNoRecibo[] = lidos.map(r => {
    if (r.tipo === 'desconhecido') return { ...r, serve: false }
    if (r.cliente === 'portofrio') return { ...r, serve: false, motivo: 'A Porto Frio ainda não entra no Ao vivo — este arquivo não será usado.' }
    if (!cabeNoAoVivo(r, a.cliente)) {
      const nome = r.cliente === 'nutrimax' || r.cliente === 'rioquality' ? NOME_CLIENTE[r.cliente] : ''
      return { ...r, serve: false, motivo: `É da ${nome} — suba no Ao vivo da ${nome}.` }
    }
    if (r.data && r.data !== hoje) return { ...r, serve: false, motivo: `É do dia ${br(r.data)}, não de hoje (${br(hoje)}).` }
    return { ...r, serve: true }
  })
  return NextResponse.json({ hoje, arquivos: resposta })
}
