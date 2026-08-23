import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { type AlteracaoParsed } from '@/lib/parsers/alteracao-text'
import { parseAlteracoesV2 } from '@/lib/parsers/alteracoes-v2'
import { blocoToParsed } from '@/lib/parsers/alteracoes-v2-adapter'
import { buildLookupContext } from '@/lib/parsers/lookup-canonical'
import { parseAlteracaoPdfTabular } from '@/lib/parsers/alteracao-pdf-tabular'
import { getDocument } from 'pdfjs-serverless'
import { parseAlteracaoTextoLivre } from '@/lib/parsers/alteracao-texto-livre'
import { inferirSaiDaEscala, inferirSaiDaEscalaLista, type EscalaLinha } from '@/lib/parsers/inferir-sai'
import { parseEscalaArquivo } from '@/lib/parsers/escala-arquivo'
import type { LinhaEscala } from '@/lib/types/escala'
import type { ParseContext } from '@/lib/parsers/alteracoes-v2.types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getPerfil } from '@/lib/perfil'

export const runtime = 'nodejs'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>

function parseTextoV2(texto: string, ctx: ParseContext): AlteracaoParsed[] {
  // Parser de prosa (estruturada) + parser de texto LIVRE (heurístico, ancora na
  // placa). Mescla os dois e deduplica: o de prosa tem prioridade; o livre só
  // acrescenta placas que a prosa não pegou. Cobre "qualquer formato" sem IA.
  const prosa = parseAlteracoesV2(texto, ctx)
    .filter((b) => b.entra || b.sai)
    .map(blocoToParsed)
  const placasProsa = new Set(prosa.map((a) => a.entra?.placa_norm).filter(Boolean))
  const extra = parseAlteracaoTextoLivre(texto, ctx)
    .filter((a) => !a.entra?.placa_norm || !placasProsa.has(a.entra.placa_norm))
  return [...prosa, ...extra]
}

async function extrairAlteracoesPdf(
  buf: Buffer,
  ctx: ParseContext,
): Promise<{ alteracoes: AlteracaoParsed[]; fonte: string; semTexto?: boolean }> {
  try {
    const tabulares = await parseAlteracaoPdfTabular(buf)
    if (tabulares.length > 0) return { alteracoes: tabulares, fonte: 'pdf-tabular' }
  } catch {
    // ignora, tenta fallback texto
  }

  // pdf-parse é rápido mas falha em fontes CID/sem ToUnicode (devolve vazio mesmo
  // havendo texto). Nesse caso cai pro pdfjs, que lê essas fontes (provado no PDF
  // de alteração 06.06: pdf-parse=0 chars, pdfjs=641 chars).
  let text = ''
  try {
    text = (await pdfParse(buf)).text
  } catch {
    text = ''
  }
  if (text.replace(/\s/g, '').length < 8) {
    text = await extrairTextoPdfjs(buf)
  }
  // Só é imagem (foto/print) de verdade quando NEM o pdfjs extrai texto.
  if (text.replace(/\s/g, '').length < 8) {
    return { alteracoes: [], fonte: 'pdf-imagem', semTexto: true }
  }
  return { alteracoes: parseTextoV2(text, ctx), fonte: 'pdf-texto' }
}

/** Extrai texto plano via pdfjs (lê fontes CID que o pdf-parse perde). */
async function extrairTextoPdfjs(buf: Buffer): Promise<string> {
  try {
    const pdf = await getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise
    let txt = ''
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      txt += content.items.map((it) => ('str' in it ? (it as { str: string }).str : '')).join(' ') + '\n'
    }
    return txt
  } catch {
    return ''
  }
}


/**
 * Parseia as escalas da sessão. Preferência: PATHS no Storage (`escalaPaths`,
 * JSON), que o cliente sobe via presign — a escala grande (≥5MB) NÃO pode
 * trafegar inline no multipart, senão estoura o limite de 4.5MB da função no
 * Vercel (PAYLOAD_TOO_LARGE). Fallback: arquivos inline (campo "escala") pro
 * desktop/local, onde não há esse limite nem Storage.
 */
async function parseEscalasSessao(fd: FormData, svc: SupabaseClient): Promise<LinhaEscala[]> {
  const dataField = fd.get('data')
  const data = typeof dataField === 'string' ? dataField : undefined
  const linhas: LinhaEscala[] = []

  const pathsField = fd.get('escalaPaths')
  if (typeof pathsField === 'string' && pathsField.trim()) {
    let paths: string[] = []
    try { paths = JSON.parse(pathsField) } catch { paths = [] }
    for (const p of paths) {
      const { data: blob, error } = await svc.storage.from('escalas-raw').download(p)
      if (error || !blob) continue
      linhas.push(...await parseEscalaArquivo(await blob.arrayBuffer(), p, data))
    }
    return linhas
  }

  const arquivos = fd.getAll('escala').filter((f): f is File => f instanceof File)
  for (const f of arquivos) {
    const buf = Buffer.from(await f.arrayBuffer())
    linhas.push(...await parseEscalaArquivo(buf, f.name, data))
  }
  return linhas
}

/**
 * Infere o SAI usando a escala da SESSÃO (a que o operador subiu na tela) quando
 * disponível; senão cai no banco (escala_linhas, 14 dias). É o cerne do fluxo: a
 * alteração tem que ler a escala que está sendo processada agora, não o histórico.
 */
async function inferirComEscala(
  alteracoes: AlteracaoParsed[],
  escalaSessao: LinhaEscala[],
  data: string,
  svc: SupabaseClient,
): Promise<AlteracaoParsed[]> {
  if (escalaSessao.length > 0) {
    return inferirSaiDaEscalaLista(alteracoes, escalaSessao as EscalaLinha[])
  }
  return inferirSaiDaEscala(alteracoes, data, svc)
}

export async function POST(req: NextRequest) {
  // createClient (com cookies) so pra autenticacao
  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })
  const perfil = await getPerfil(user.id)
  if (perfil.papel !== 'admin') return new NextResponse('Sem permissão.', { status: 403 })

  // Bug I3 (auditoria 2026-05-27): buildLookupContext e inferirSaiDaEscala leem
  // escala_linhas/lojas. Se RLS esconder dados do user autenticado, retornam
  // vazio e inferencia falha. Service client ignora RLS — leitura sempre
  // completa. Usar APOS auth check.
  const svc = createServiceClient()
  const ctx = await buildLookupContext(svc)
  const ct = req.headers.get('content-type') ?? ''

  if (!ct.includes('application/json')) {
    const fd = await req.formData()
    const dataField = fd.get('data')
    const data = typeof dataField === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dataField) ? dataField : ''
    const escalaSessao = await parseEscalasSessao(fd, svc)
    const pdfFile = fd.get('pdf')
    if (pdfFile instanceof File) {
      const buf = Buffer.from(await pdfFile.arrayBuffer())
      const { alteracoes, semTexto } = await extrairAlteracoesPdf(buf, ctx)
      if (semTexto) {
        return new NextResponse(
          'Esse PDF é uma imagem/foto (não tem texto pra ler). Cole o texto da alteração no campo de texto, ou envie um PDF de texto.',
          { status: 422 },
        )
      }
      const inferidas = await inferirComEscala(alteracoes, escalaSessao, data, svc)
      return NextResponse.json(inferidas)
    }
    const textoField = fd.get('texto')
    if (typeof textoField === 'string') {
      const alteracoes = parseTextoV2(textoField, ctx)
      const inferidas = await inferirComEscala(alteracoes, escalaSessao, data, svc)
      return NextResponse.json(inferidas)
    }
    return new NextResponse('Envie "texto" ou "pdf".', { status: 400 })
  }

  const body = await req.json().catch(() => null)
  if (!body?.texto) return new NextResponse('"texto" obrigatório.', { status: 400 })
  const texto = String(body.texto)
  const data = typeof body.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.data) ? body.data : ''
  const alteracoes = parseTextoV2(texto, ctx)
  const inferidas = await inferirSaiDaEscala(alteracoes, data, svc)
  return NextResponse.json(inferidas)
}
