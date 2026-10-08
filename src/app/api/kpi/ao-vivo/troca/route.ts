import { NextRequest, NextResponse } from 'next/server'
import { hojeBR } from '@/lib/data-br'
import { createServiceClient } from '@/lib/supabase/service'
import { EMPRESA_NUTRIMAX } from '@/lib/kpi-romaneio/constants'
import { normalizarPlacaDigitada, decidirTrocaManual } from '@/lib/kpi-romaneio/trocas-placa'
import { calcularAoVivo } from '@/lib/kpi-romaneio/ao-vivo-servico'
import { acessoAoVivo } from '../acesso'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// "Confirmar troca" do Ao vivo (06/10, carro trocado sem aviso): grava a troca
// do dia (mesma tabela da tela Placas do dia), passa as entregas pro carro
// certo no monitoramento e recalcula. Só hoje, só Nutry Max.
export async function POST(req: NextRequest) {
  const a = await acessoAoVivo('nutrimax')
  if (!a.ok) return a.resp
  const b = (await req.json().catch(() => ({}))) as { carga?: unknown; placaEscala?: unknown; placaReal?: unknown }
  const carga = typeof b.carga === 'string' ? b.carga.trim() : ''
  const placaTela = typeof b.placaEscala === 'string' ? normalizarPlacaDigitada(b.placaEscala) : ''
  const placaReal = typeof b.placaReal === 'string' ? normalizarPlacaDigitada(b.placaReal) : ''
  if (!carga || !placaTela || !placaReal) return new NextResponse('Troca inválida.', { status: 400 })
  const data = hojeBR()
  const svc = createServiceClient()
  const { data: ja } = await svc.from('kpi_troca_placa').select('id, placa_escala, placa_real').eq('empresa', EMPRESA_NUTRIMAX).eq('data', data).eq('carga', carga).order('id', { ascending: false }).limit(1)
  const existente = ja?.[0] ? { placaEscala: ja[0].placa_escala as string, placaReal: ja[0].placa_real as string } : null
  const d = decidirTrocaManual(existente, placaTela, placaReal)
  if ('erro' in d) return new NextResponse(d.erro, { status: 400 })
  const quem = `${a.email ?? 'operador'} (Ao vivo)`
  if (d.acao === 'inserir') {
    const { error } = await svc.from('kpi_troca_placa').insert({ empresa: EMPRESA_NUTRIMAX, data, carga, placa_escala: d.placaEscala, placa_real: d.placaReal, responsavel: quem })
    if (error) return new NextResponse(error.message, { status: 500 })
  } else {
    // Mesma carga já trocada: corrige (ou desfaz, voltando pra placa da escala).
    const q = svc.from('kpi_troca_placa')
    const { error } = d.acao === 'desfazer'
      ? await q.delete().eq('empresa', EMPRESA_NUTRIMAX).eq('data', data).eq('carga', carga)
      : await q.update({ placa_real: d.placaReal, responsavel: quem }).eq('empresa', EMPRESA_NUTRIMAX).eq('data', data).eq('carga', carga)
    if (error) return new NextResponse(error.message, { status: 500 })
  }
  const monitoramento = await trocarNoMonitoramento(data, d.moverNoMonitoramentoDe, d.placaReal, await nfsDaCarga(data, carga))
  // Recalcula em segundo plano; a tela pega no próximo GET.
  void calcularAoVivo('nutrimax', data).catch(() => {})
  return NextResponse.json({ ok: true, acao: d.acao, monitoramento })
}

/** NFs da carga no romaneio do dia (normal + pão). Troca mútua entre dois carros
 *  escalados (07/10) precisa mover só as notas desta carga no monitoramento. */
async function nfsDaCarga(data: string, carga: string): Promise<string[]> {
  const { data: d } = await createServiceClient().from('kpi_ao_vivo_dia').select('romaneio, pao')
    .eq('cliente', 'nutrimax').eq('data', data).maybeSingle()
  if (!d) return []
  type L = { nf?: string; carga?: string }
  const linhas: L[] = [...((d.romaneio as L[] | null) ?? []), ...(((d.pao as { linhas?: L[] } | null)?.linhas) ?? [])]
  return [...new Set(linhas.filter(l => l.carga === carga && l.nf).map(l => l.nf as string))]
}

async function trocarNoMonitoramento(data: string, placaDe: string, placaPara: string, nfs: string[]): Promise<{ ok: boolean; pontos?: number; erro?: string }> {
  const chave = process.env.MOTOR_SECRET
  if (!chave) return { ok: false, erro: 'MOTOR_SECRET ausente' }
  try {
    const r = await fetch(`${process.env.MONITORAMENTO_URL ?? 'http://127.0.0.1:3010'}/api/romaneio/trocar-veiculo`, {
      method: 'POST', headers: { 'x-motor-key': chave, 'content-type': 'application/json' },
      // Sem as NFs da carga (romaneio não achado) cai no comportamento antigo: a placa inteira.
      body: JSON.stringify({ data, placaDe, placaPara, ...(nfs.length ? { nfs } : {}) }), signal: AbortSignal.timeout(20_000),
    })
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; pontos?: number; erro?: string }
    return j.ok ? { ok: true, pontos: j.pontos } : { ok: false, erro: j.erro ?? `HTTP ${r.status}` }
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : String(err) }
  }
}
