import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { hojeBR } from '@/lib/data-br'
import { buscarResolucoes, registrarResolucao, vigentesPorNf } from '@/lib/kpi-romaneio/resolucoes'
import { empresaDaResolucao, paraTela, nfSemNumeroReal, AVISO_NF_SEM_NUMERO, type ClienteConferencia } from '@/lib/kpi-romaneio/fila-conferir'
import { nfDoDia } from '@/lib/kpi-romaneio/conferencia-servico'
import { presencaDaConferencia } from '@/lib/kpi-romaneio/conferencia-presenca'
import type { ResolucaoNf } from '@/lib/kpi-romaneio/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 09/11: conferência pedida pela tela "Entrega no mapa" do monitoramento
// (botão Confirmar entrega). Servidor a servidor com x-motor-key; quem
// confirmou vem no corpo (o monitoramento já checou que a conta enxerga a
// frota). Grava em kpi_nf_resolucao como a fila Conferir do Ao vivo.
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/
const ACOES: Record<string, ResolucaoNf> = { confirmar: 'confirmada_operacao', nao_esteve: 'nao_esteve_no_local', desfazer: 'desfeita' }

function chaveOk(req: NextRequest): boolean {
  const esperado = process.env.MOTOR_SECRET
  const veio = req.headers.get('x-motor-key')
  if (!esperado || !veio) return false
  const a = Buffer.from(esperado), b = Buffer.from(veio)
  return a.length === b.length && timingSafeEqual(a, b)
}
const cliOk = (c: unknown): c is ClienteConferencia => c === 'nutrimax' || c === 'rioquality'

/** ?cliente=&data=&nf= -> conferência vigente da NF (ou null). */
export async function GET(req: NextRequest) {
  if (!chaveOk(req)) return NextResponse.json({ erro: 'não autorizado' }, { status: 401 })
  const q = req.nextUrl.searchParams
  const cliente = q.get('cliente'), data = q.get('data') ?? '', nf = q.get('nf') ?? ''
  if (!cliOk(cliente) || !DATA_RE.test(data) || !nf) return NextResponse.json({ erro: 'parâmetros inválidos' }, { status: 400 })
  const v = vigentesPorNf(await buscarResolucoes(empresaDaResolucao(cliente), data)).get(nf)
  return NextResponse.json({ conferencia: v ? paraTela(v) : null })
}

/** corpo JSON: { cliente, data, nf, acao: confirmar|nao_esteve|desfazer, responsavel, observacao? } */
export async function POST(req: NextRequest) {
  if (!chaveOk(req)) return NextResponse.json({ erro: 'não autorizado' }, { status: 401 })
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const cliente = b?.cliente, data = typeof b?.data === 'string' ? b.data : '', nf = typeof b?.nf === 'string' ? b.nf.trim() : ''
  const resolucao = typeof b?.acao === 'string' ? ACOES[b.acao] : undefined
  const responsavel = typeof b?.responsavel === 'string' ? b.responsavel.trim().slice(0, 200) : ''
  const observacao = typeof b?.observacao === 'string' && b.observacao.trim() ? b.observacao.trim().slice(0, 1000) : null
  if (!cliOk(cliente)) return NextResponse.json({ erro: 'cliente inválido' }, { status: 400 })
  const hoje = hojeBR()
  if (!DATA_RE.test(data) || data > hoje) return NextResponse.json({ erro: 'data inválida' }, { status: 400 })
  if (!nf || nf.length > 40) return NextResponse.json({ erro: 'NF inválida' }, { status: 400 })
  if (!resolucao) return NextResponse.json({ erro: 'ação inválida' }, { status: 400 })
  if (!responsavel) return NextResponse.json({ erro: 'responsável ausente' }, { status: 400 })
  if (nfSemNumeroReal(cliente, nf)) return NextResponse.json({ erro: AVISO_NF_SEM_NUMERO }, { status: 422 })
  const achada = await nfDoDia(cliente, data, hoje, nf)
  if (achada === 'sem_dia') return NextResponse.json({ erro: 'Este dia não tem KPI calculado.' }, { status: 409 })
  if (!achada) return NextResponse.json({ erro: `A NF ${nf} não está no KPI deste dia.` }, { status: 404 })
  try {
    const linha = await registrarResolucao({ empresa: empresaDaResolucao(cliente), data, nf, resolucao, placa_executora: null, observacao, responsavel, documento: null })
    console.log(`[conferencia-externa] ${cliente} ${data} NF ${nf}: ${resolucao} por ${responsavel}`)
    await presencaDaConferencia(data, nf, achada.placa, achada.nf.chegada, resolucao).catch(() => {})
    return NextResponse.json({ ok: true, conferencia: paraTela(linha) })
  } catch (e) {
    console.error('[conferencia-externa] gravação falhou:', e)
    return NextResponse.json({ erro: 'Não consegui gravar a conferência. Tente de novo.' }, { status: 500 })
  }
}
