import { NextRequest, NextResponse } from 'next/server'
import { hojeBR } from '@/lib/data-br'
import { createServiceClient } from '@/lib/supabase/service'
import { EMPRESA_NUTRIMAX, COD_USER_NUTRIMAX } from '@/lib/kpi-romaneio/constants'
import { normalizarPlacaDigitada, decidirTrocaManual, decidirTroca, resolverPlacaDigitada, type ModoTroca } from '@/lib/kpi-romaneio/trocas-placa'
import { buscarFrota } from '@/lib/unitrac-api'
import { calcularAoVivo } from '@/lib/kpi-romaneio/ao-vivo-servico'
import { acessoAoVivo } from '../acesso'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// "Confirmar troca" / "Redirecionar carga" do Ao vivo. A operação escolhe o
// MODO (13/10): redirecionar (1 carga A->B), substituir (placa A inteira ->B)
// ou mútua (A<->B). Grava em kpi_troca_placa, passa as NFs certas pro carro no
// monitoramento e recalcula. Por enquanto só Nutry Max (a RQ não tem o mesmo
// conceito de carga/frota -- ver plano 2026-10-13, Frente A deferida pra RQ).
const MODOS: ModoTroca[] = ['redirecionar', 'mutua', 'substituir']

export async function POST(req: NextRequest) {
  const a = await acessoAoVivo('nutrimax')
  if (!a.ok) return a.resp
  const b = (await req.json().catch(() => ({}))) as { modo?: unknown; carga?: unknown; placaEscala?: unknown; placaReal?: unknown; placaB?: unknown }
  const modo: ModoTroca = MODOS.includes(b.modo as ModoTroca) ? (b.modo as ModoTroca) : 'redirecionar'
  const data = hojeBR()
  const quem = `${a.email ?? 'operador'} (Ao vivo)`
  const frota = async () => (await buscarFrota(COD_USER_NUTRIMAX)).map(v => v.placaNorm)

  if (modo === 'redirecionar') return redirecionar(b, data, quem, frota)
  return trocaDePlacas(modo, b, data, quem, frota)
}

/** Modo atual (1 carga -> outra placa), com insert/atualizar/desfazer. */
async function redirecionar(
  b: { carga?: unknown; placaEscala?: unknown; placaReal?: unknown },
  data: string, quem: string, frota: () => Promise<string[]>,
): Promise<NextResponse> {
  const carga = typeof b.carga === 'string' ? b.carga.trim() : ''
  const placaTela = typeof b.placaEscala === 'string' ? normalizarPlacaDigitada(b.placaEscala) : ''
  const digitada = typeof b.placaReal === 'string' ? normalizarPlacaDigitada(b.placaReal) : ''
  if (!carga || !placaTela || !digitada) return new NextResponse('Troca inválida.', { status: 400 })
  const rp = await resolverPlacaDigitada(digitada, frota)
  if ('erro' in rp) return new NextResponse(rp.erro, { status: 400 })
  const svc = createServiceClient()
  const { data: ja } = await svc.from('kpi_troca_placa').select('id, placa_escala, placa_real').eq('empresa', EMPRESA_NUTRIMAX).eq('data', data).eq('carga', carga).order('id', { ascending: false }).limit(1)
  const existente = ja?.[0] ? { placaEscala: ja[0].placa_escala as string, placaReal: ja[0].placa_real as string } : null
  const d = decidirTrocaManual(existente, placaTela, rp.placa)
  if ('erro' in d) return new NextResponse(d.erro, { status: 400 })
  if (d.acao === 'inserir') {
    const { error } = await svc.from('kpi_troca_placa').insert({ empresa: EMPRESA_NUTRIMAX, data, carga, placa_escala: d.placaEscala, placa_real: d.placaReal, responsavel: quem })
    if (error) return new NextResponse(error.message, { status: 500 })
  } else {
    const q = svc.from('kpi_troca_placa')
    const { error } = d.acao === 'desfazer'
      ? await q.delete().eq('empresa', EMPRESA_NUTRIMAX).eq('data', data).eq('carga', carga)
      : await q.update({ placa_real: d.placaReal, responsavel: quem }).eq('empresa', EMPRESA_NUTRIMAX).eq('data', data).eq('carga', carga)
    if (error) return new NextResponse(error.message, { status: 500 })
  }
  const nfs = await nfsDaCarga(data, carga)
  // Sem as NFs da carga NÃO movemos a placa inteira (fallback antigo embolava a
  // troca mútua) -- é um erro explícito.
  if (d.acao !== 'desfazer' && nfs.length === 0) return new NextResponse('Não achei as NFs dessa carga no romaneio do dia.', { status: 409 })
  const monitoramento = nfs.length ? await trocarNoMonitoramento(data, d.moverNoMonitoramentoDe, d.placaReal, nfs) : { ok: true, pontos: 0 }
  void calcularAoVivo('nutrimax', data).catch(() => {})
  return NextResponse.json({ ok: true, modo: 'redirecionar', acao: d.acao, placaReal: d.placaReal, monitoramento })
}

/** Modos substituir (A->B placa inteira) e mútua (A<->B). Ancorado nas placas
 *  de escala original; captura as NFs de cada placa ANTES de aplicar. */
async function trocaDePlacas(
  modo: ModoTroca,
  b: { placaEscala?: unknown; placaB?: unknown },
  data: string, quem: string, frota: () => Promise<string[]>,
): Promise<NextResponse> {
  const digA = typeof b.placaEscala === 'string' ? b.placaEscala : ''
  const digB = typeof b.placaB === 'string' ? b.placaB : ''
  if (!digA || !digB) return new NextResponse('Escolha as duas placas.', { status: 400 })
  const rA = await resolverPlacaDigitada(digA, frota)
  if ('erro' in rA) return new NextResponse(rA.erro, { status: 400 })
  const rB = await resolverPlacaDigitada(digB, frota)
  if ('erro' in rB) return new NextResponse(rB.erro, { status: 400 })
  const d = decidirTroca(modo, { placaA: rA.placa, placaB: rB.placa })
  if ('erro' in d) return new NextResponse(d.erro, { status: 400 })

  // Captura as NFs de cada movimento ANTES de aplicar (romaneio original).
  const comNfs = await Promise.all(d.movimentos.map(async (m) => ({ m, nfs: await nfsDaPlaca(data, m.de) })))

  const svc = createServiceClient()
  // Idempotência: limpa as trocas de placa (carga nula) dessas placas no dia e regrava.
  const placas = [...new Set(d.linhas.map(l => l.placaEscala))]
  await svc.from('kpi_troca_placa').delete().eq('empresa', EMPRESA_NUTRIMAX).eq('data', data).is('carga', null).in('placa_escala', placas)
  const { error } = await svc.from('kpi_troca_placa').insert(d.linhas.map(l => ({ empresa: EMPRESA_NUTRIMAX, data, carga: null, placa_escala: l.placaEscala, placa_real: l.placaReal, responsavel: quem })))
  if (error) return new NextResponse(error.message, { status: 500 })

  const movimentos: Array<{ de: string; para: string; monitoramento: { ok: boolean; pontos?: number; erro?: string }; semNotas?: boolean }> = []
  for (const { m, nfs } of comNfs) {
    if (nfs.length === 0) { movimentos.push({ de: m.de, para: m.para, monitoramento: { ok: true, pontos: 0 }, semNotas: true }); continue }
    movimentos.push({ de: m.de, para: m.para, monitoramento: await trocarNoMonitoramento(data, m.de, m.para, nfs) })
  }
  void calcularAoVivo('nutrimax', data).catch(() => {})
  return NextResponse.json({ ok: true, modo, movimentos })
}

/** NFs de uma carga no romaneio do dia (normal + pão). */
async function nfsDaCarga(data: string, carga: string): Promise<string[]> {
  const linhas = await romaneioDoDia(data)
  return [...new Set(linhas.filter(l => l.carga === carga && l.nf).map(l => l.nf as string))]
}

/** NFs de uma placa no romaneio do dia (normal + pão). Placa = a de escala
 *  original (o romaneio guardado ainda não tem a troca aplicada). */
async function nfsDaPlaca(data: string, placa: string): Promise<string[]> {
  const p = normalizarPlacaDigitada(placa)
  const linhas = await romaneioDoDia(data)
  return [...new Set(linhas.filter(l => l.placa && normalizarPlacaDigitada(l.placa) === p && l.nf).map(l => l.nf as string))]
}

type LinhaRomaneio = { nf?: string; carga?: string; placa?: string }
async function romaneioDoDia(data: string): Promise<LinhaRomaneio[]> {
  const { data: d } = await createServiceClient().from('kpi_ao_vivo_dia').select('romaneio, pao')
    .eq('cliente', 'nutrimax').eq('data', data).maybeSingle()
  if (!d) return []
  return [...((d.romaneio as LinhaRomaneio[] | null) ?? []), ...(((d.pao as { linhas?: LinhaRomaneio[] } | null)?.linhas) ?? [])]
}

async function trocarNoMonitoramento(data: string, placaDe: string, placaPara: string, nfs: string[]): Promise<{ ok: boolean; pontos?: number; erro?: string }> {
  const chave = process.env.MOTOR_SECRET
  if (!chave) return { ok: false, erro: 'MOTOR_SECRET ausente' }
  try {
    const r = await fetch(`${process.env.MONITORAMENTO_URL ?? 'http://127.0.0.1:3010'}/api/romaneio/trocar-veiculo`, {
      method: 'POST', headers: { 'x-motor-key': chave, 'content-type': 'application/json' },
      body: JSON.stringify({ data, placaDe, placaPara, nfs }), signal: AbortSignal.timeout(20_000),
    })
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; pontos?: number; erro?: string }
    return j.ok ? { ok: true, pontos: j.pontos } : { ok: false, erro: j.erro ?? `HTTP ${r.status}` }
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : String(err) }
  }
}
