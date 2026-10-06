import { NextRequest, NextResponse } from 'next/server'
import { hojeBR } from '@/lib/data-br'
import { createServiceClient } from '@/lib/supabase/service'
import { EMPRESA_NUTRIMAX } from '@/lib/kpi-romaneio/constants'
import { normalizarPlacaDigitada } from '@/lib/kpi-romaneio/trocas-placa'
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
  const placaEscala = typeof b.placaEscala === 'string' ? normalizarPlacaDigitada(b.placaEscala) : ''
  const placaReal = typeof b.placaReal === 'string' ? normalizarPlacaDigitada(b.placaReal) : ''
  if (!carga || !placaEscala || !placaReal || placaEscala === placaReal) return new NextResponse('Troca inválida.', { status: 400 })
  const data = hojeBR()
  const svc = createServiceClient()
  const { data: ja } = await svc.from('kpi_troca_placa').select('id').eq('empresa', EMPRESA_NUTRIMAX).eq('data', data).eq('carga', carga).limit(1)
  if (!ja?.length) {
    const { error } = await svc.from('kpi_troca_placa').insert({ empresa: EMPRESA_NUTRIMAX, data, carga, placa_escala: placaEscala, placa_real: placaReal, responsavel: `${a.email ?? 'operador'} (Ao vivo)` })
    if (error) return new NextResponse(error.message, { status: 500 })
  }
  const monitoramento = await trocarNoMonitoramento(data, placaEscala, placaReal)
  // Recalcula em segundo plano; a tela pega no próximo GET.
  void calcularAoVivo('nutrimax', data).catch(() => {})
  return NextResponse.json({ ok: true, monitoramento })
}

async function trocarNoMonitoramento(data: string, placaDe: string, placaPara: string): Promise<{ ok: boolean; pontos?: number; erro?: string }> {
  const chave = process.env.MOTOR_SECRET
  if (!chave) return { ok: false, erro: 'MOTOR_SECRET ausente' }
  try {
    const r = await fetch(`${process.env.MONITORAMENTO_URL ?? 'http://127.0.0.1:3010'}/api/romaneio/trocar-veiculo`, {
      method: 'POST', headers: { 'x-motor-key': chave, 'content-type': 'application/json' },
      body: JSON.stringify({ data, placaDe, placaPara }), signal: AbortSignal.timeout(20_000),
    })
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; pontos?: number; erro?: string }
    return j.ok ? { ok: true, pontos: j.pontos } : { ok: false, erro: j.erro ?? `HTTP ${r.status}` }
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : String(err) }
  }
}
