import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { hojeBR } from '@/lib/data-br'
import { acessoAoVivo } from '../ao-vivo/acesso'
import { CLIENTE_PONTO, acaoPontoValida, caminhoEvidenciaPonto } from '@/lib/kpi-romaneio/ponto-cliente'
import { montarPainel, listarClientesQueFalham, documentoDaCorrecao, repoSupabase, esquecerJanela } from '@/lib/kpi-romaneio/ponto-cliente-servico'
import { aplicarCorrecaoPonto, desfazerCorrecaoPonto, TrilhaIndisponivel } from '@/lib/kpi-romaneio/ponto-cliente-correcao'
import { validarComprovante, TIPO_POR_EXTENSAO } from '@/lib/kpi-romaneio/comprovante'
import { guardarComprovante, apagarComprovante, baixarComprovante } from '@/lib/kpi-romaneio/conferencia-servico'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// F4-07 (GEO-24, ACH-07, D-08): "Clientes que sempre falham" e "Corrigir
// ponto". Só operador com a Nutry e admin (acessoAoVivo). A correção só sai de
// uma evidência que o SERVIDOR recalcula (parada repetida com a rua do CNEFE
// batendo, cadastro Unitrac confirmado por parada, ponto aprendido com 2+
// confirmações); a tela manda só o id dela. Arrastar o pino: só admin, com
// anexo (bucket da fila Conferir, F3-03) e explicação. Grava kpi_cliente_local
// fonte manual + trilha com o estado anterior; "Desfazer" volta a ele.
const CODIGO_RE = /^[0-9A-Za-z_-]{1,40}$/
const AVISO_SO_NUTRY = 'Corrigir ponto é só da Nutry Max: na Rio Quality o código do cliente é a NF até a integração das 55 colunas (F4-09).'
const AVISO_SEM_TRILHA = 'A correção de ponto ainda não está liberada (falta aplicar a migration da trilha). Nada foi gravado.'

/** ?cliente=nutrimax -> lista; &codigo= -> painel; &codigo=&evidencia=<id> -> anexo. */
export async function GET(req: NextRequest) {
  const a = await acessoAoVivo(req.nextUrl.searchParams.get('cliente'))
  if (!a.ok) return a.resp
  if (a.cliente !== CLIENTE_PONTO) return new NextResponse(AVISO_SO_NUTRY, { status: 422 })
  const codigo = req.nextUrl.searchParams.get('codigo')
  const hoje = hojeBR()
  try {
    if (!codigo) {
      const r = await listarClientesQueFalham(hoje)
      return NextResponse.json({ ...r, admin: !!a.admin }, { headers: { 'Cache-Control': 'no-store' } })
    }
    if (!CODIGO_RE.test(codigo)) return new NextResponse('Código do cliente inválido.', { status: 400 })
    const evid = req.nextUrl.searchParams.get('evidencia')
    if (evid) {
      const id = Number(evid)
      if (!Number.isInteger(id) || id <= 0) return new NextResponse('Id inválido.', { status: 400 })
      const caminho = await documentoDaCorrecao(codigo, id)
      const conteudo = caminho ? await baixarComprovante(caminho) : null
      if (!caminho || !conteudo) return new NextResponse('Evidência não encontrada.', { status: 404 })
      const ext = caminho.split('.').pop() ?? ''
      return new NextResponse(new Uint8Array(conteudo), {
        headers: {
          'Content-Type': TIPO_POR_EXTENSAO[ext] ?? 'application/octet-stream',
          'Content-Disposition': `inline; filename="evidencia-ponto-${codigo}-${id}.${ext}"`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    }
    const painel = await montarPainel(hoje, codigo, {})
    if (!painel) return new NextResponse('Cliente sem notas nos últimos dias do Ao vivo.', { status: 404 })
    return NextResponse.json({ painel, admin: !!a.admin }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[ponto-cliente] leitura falhou:', e)
    return new NextResponse('Não consegui ler os dias deste cliente. Tente de novo.', { status: 503 })
  }
}

/** Corpo multipart: codigo, acao (parada|cadastro_unitrac|aprendido|pino|desfazer),
 *  id?, lat?, lng?, observacao?, evidencia? (arquivo), correcao? (id, no desfazer). */
export async function POST(req: NextRequest) {
  const a = await acessoAoVivo(req.nextUrl.searchParams.get('cliente'))
  if (!a.ok) return a.resp
  if (a.cliente !== CLIENTE_PONTO) return new NextResponse(AVISO_SO_NUTRY, { status: 422 })
  const form = await req.formData().catch(() => null)
  if (!form) return new NextResponse('Pedido inválido.', { status: 400 })
  const texto = (k: string) => { const v = form.get(k); return typeof v === 'string' ? v.trim() : '' }
  const codigo = texto('codigo')
  if (!CODIGO_RE.test(codigo)) return new NextResponse('Código do cliente inválido.', { status: 400 })
  const responsavel = a.email ?? 'operador'
  const quem = { email: responsavel, admin: !!a.admin }
  const acao = texto('acao')

  if (acao === 'desfazer') {
    const id = Number(texto('correcao'))
    if (!Number.isInteger(id) || id <= 0) return new NextResponse('Correção inválida.', { status: 400 })
    try {
      const r = await desfazerCorrecaoPonto(repoSupabase(), codigo, id, quem)
      if (!r.ok) return new NextResponse(r.erro, { status: r.status })
      esquecerJanela()
      console.log(`[ponto-cliente] cliente ${codigo}: correção ${id} desfeita por ${responsavel}`)
      return NextResponse.json({ ok: true })
    } catch (e) {
      if (e instanceof TrilhaIndisponivel) return new NextResponse(AVISO_SEM_TRILHA, { status: 503 })
      console.error('[ponto-cliente] desfazer falhou:', e)
      return new NextResponse('Não consegui desfazer. Tente de novo.', { status: 500 })
    }
  }

  if (!acaoPontoValida(acao)) return new NextResponse('Ação inválida.', { status: 400 })
  if (acao === 'pino' && !a.admin) return new NextResponse('Só o admin marca o ponto no mapa.', { status: 403 })
  const num = (k: string) => { const t = texto(k); if (!t) return null; const n = Number(t); return Number.isFinite(n) ? n : null }
  const arq = form.get('evidencia')
  const arquivo = arq instanceof File && arq.size > 0 ? arq : null
  if (acao === 'pino' && !arquivo) return new NextResponse('Anexe a evidência (foto, canhoto ou print do cadastro) para marcar o ponto no mapa.', { status: 400 })
  let extensao: string | null = null
  if (arquivo) {
    const v = validarComprovante(arquivo)
    if (!v.ok) return new NextResponse(v.erro, { status: 400 })
    extensao = v.extensao
  }

  let caminho: string | null = null
  try {
    const painel = await montarPainel(hojeBR(), codigo, { forcar: true })
    if (!painel) return new NextResponse('Cliente sem notas nos últimos dias do Ao vivo.', { status: 404 })
    if (arquivo && extensao) {
      caminho = caminhoEvidenciaPonto(CLIENTE_PONTO, codigo, extensao, Date.now(), randomBytes(4).toString('hex'))
      await guardarComprovante(caminho, await arquivo.arrayBuffer(), arquivo.type)
    }
    const r = await aplicarCorrecaoPonto(repoSupabase(), painel,
      { acao, id: texto('id') || null, lat: num('lat'), lng: num('lng'), observacao: texto('observacao') || null },
      { ...quem, documento: caminho })
    if (!r.ok) {
      if (caminho) { try { await apagarComprovante(caminho) } catch { /* órfão no bucket, não muda nada */ } }
      return new NextResponse(r.erro, { status: r.status })
    }
    esquecerJanela()
    console.log(`[ponto-cliente] cliente ${codigo}: ponto corrigido (${acao}) por ${responsavel} -> ${r.correcao.lat},${r.correcao.lng} (correção ${r.correcao.id})`)
    return NextResponse.json({ ok: true, correcao: { id: r.correcao.id, acao: r.correcao.acao, lat: r.correcao.lat, lng: r.correcao.lng } })
  } catch (e) {
    if (caminho) { try { await apagarComprovante(caminho) } catch { /* órfão no bucket, não muda nada */ } }
    if (e instanceof TrilhaIndisponivel) return new NextResponse(AVISO_SEM_TRILHA, { status: 503 })
    console.error('[ponto-cliente] correção falhou:', e)
    return new NextResponse('Não consegui gravar a correção. Tente de novo.', { status: 500 })
  }
}
