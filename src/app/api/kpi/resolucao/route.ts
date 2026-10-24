import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { hojeBR } from '@/lib/data-br'
import { acessoAoVivo } from '../ao-vivo/acesso'
import { buscarResolucoes, registrarResolucao, vigentesPorNf } from '@/lib/kpi-romaneio/resolucoes'
import { acaoConferencia, empresaDaResolucao, paraTela } from '@/lib/kpi-romaneio/fila-conferir'
import { validarComprovante, caminhoComprovante } from '@/lib/kpi-romaneio/comprovante'
import { nfDoDia, guardarComprovante, apagarComprovante } from '@/lib/kpi-romaneio/conferencia-servico'
import { normalizarPlacaDigitada } from '@/lib/kpi-romaneio/trocas-placa'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// F3-03 (ACH-02, KN-11, KRQ-10): fila "Conferir" do Ao vivo. Grava a
// resolução da operação por NF em kpi_nf_resolucao (sempre INSERT; a mais
// recente vale, o histórico fica) com o responsável logado. A leitura
// automática do KPI nunca é alterada; a taxa oficial (GPS) não muda (D-06).
// Só operador com a empresa liberada e admin (acessoAoVivo).
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/
const OBS_MAX = 1000

/** ?cliente=&data= -> resolução vigente de cada NF do dia. */
export async function GET(req: NextRequest) {
  const a = await acessoAoVivo(req.nextUrl.searchParams.get('cliente'))
  if (!a.ok) return a.resp
  const data = req.nextUrl.searchParams.get('data') ?? ''
  if (!DATA_RE.test(data)) return new NextResponse('Data inválida.', { status: 400 })
  try {
    const linhas = await buscarResolucoes(empresaDaResolucao(a.cliente), data)
    const vigentes = [...vigentesPorNf(linhas).values()].map(paraTela)
    return NextResponse.json({ resolucoes: vigentes, historico: linhas.length }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[resolucao] leitura falhou:', e)
    return new NextResponse('Não consegui ler as conferências deste dia.', { status: 503 })
  }
}

/** ?cliente= ; corpo multipart: data, nf, acao, observacao?, placaExecutora?, comprovante? */
export async function POST(req: NextRequest) {
  const a = await acessoAoVivo(req.nextUrl.searchParams.get('cliente'))
  if (!a.ok) return a.resp
  const form = await req.formData().catch(() => null)
  if (!form) return new NextResponse('Pedido inválido.', { status: 400 })
  const texto = (k: string) => { const v = form.get(k); return typeof v === 'string' ? v.trim() : '' }

  const hoje = hojeBR()
  const data = texto('data')
  if (!DATA_RE.test(data) || data > hoje) return new NextResponse('Data inválida.', { status: 400 })
  const nf = texto('nf')
  if (!nf || nf.length > 40) return new NextResponse('NF inválida.', { status: 400 })
  const def = acaoConferencia(texto('acao'))
  if (!def) return new NextResponse('Ação inválida.', { status: 400 })
  const observacao = texto('observacao').slice(0, OBS_MAX) || null
  const placa = def.exigePlaca ? normalizarPlacaDigitada(texto('placaExecutora')) : ''
  if (def.exigePlaca && !/^[A-Z0-9]{7}$/.test(placa)) return new NextResponse('Informe a placa que fez a entrega (7 letras e números).', { status: 400 })

  const arq = form.get('comprovante')
  const arquivo = arq instanceof File && arq.size > 0 ? arq : null
  if (def.exigeComprovante && !arquivo) return new NextResponse('Anexe o canhoto ou a foto da entrega.', { status: 400 })
  let extensao: string | null = null
  if (arquivo) {
    const v = validarComprovante(arquivo)
    if (!v.ok) return new NextResponse(v.erro, { status: 400 })
    extensao = v.extensao
  }

  // A NF tem que estar no dia que a tela mostra (evita gravar NF digitada errada).
  const achada = await nfDoDia(a.cliente, data, hoje, nf)
  if (achada === 'sem_dia') return new NextResponse('Este dia não tem KPI calculado nem guardado.', { status: 409 })
  if (!achada) return new NextResponse(`A NF ${nf} não está no KPI deste dia.`, { status: 404 })

  let caminho: string | null = null
  if (arquivo && extensao) {
    caminho = caminhoComprovante(a.cliente, data, nf, extensao, Date.now(), randomBytes(4).toString('hex'))
    try {
      await guardarComprovante(caminho, await arquivo.arrayBuffer(), arquivo.type)
    } catch (e) {
      console.error('[resolucao] comprovante não guardado:', e)
      return new NextResponse('Não consegui guardar o comprovante. Tente de novo.', { status: 500 })
    }
  }
  try {
    const linha = await registrarResolucao({
      empresa: empresaDaResolucao(a.cliente), data, nf, resolucao: def.resolucao,
      placa_executora: def.exigePlaca ? placa : null, observacao,
      responsavel: a.email ?? 'operador', documento: caminho,
    })
    console.log(`[resolucao] ${a.cliente} ${data} NF ${nf}: ${def.resolucao} por ${a.email ?? 'operador'}`)
    return NextResponse.json({ ok: true, resolucao: paraTela(linha) })
  } catch (e) {
    console.error('[resolucao] gravação falhou:', e)
    if (caminho) { try { await apagarComprovante(caminho) } catch { /* fica órfão no bucket; não muda nada */ } }
    return new NextResponse('Não consegui gravar a conferência. Tente de novo.', { status: 500 })
  }
}
