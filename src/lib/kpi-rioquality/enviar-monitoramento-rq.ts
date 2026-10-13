// src/lib/kpi-rioquality/enviar-monitoramento-rq.ts
//
// Manda o romaneio da Rio Quality (dados da Fusion) pro Monitoramento, pros
// 118 carros RQ aparecerem no mapa (modo Romaneio). A RQ não sobe PDF: envia
// as linhas estruturadas pro endpoint /api/romaneio/rioquality, com a data do
// dia FIXA (hojeBR) -- o Monitoramento geocodifica no cron. Fail-open: nunca
// lança (o tick segue).
import type { EntregaRioQualityCompleta } from './parse-planilhas'

export type LinhaMonitoramentoRQ = {
  placa: string; nf: string; clienteCodigo: string; clienteNome: string; enderecoBruto: string
}

function enderecoBruto(e: EntregaRioQualityCompleta): string {
  const partes = [e.rua, e.bairro, e.cidade && e.uf ? `${e.cidade} - ${e.uf}` : e.cidade]
    .map(p => (p ?? '').trim()).filter(Boolean)
  return partes.join(', ')
}

/** Monta as linhas pro Monitoramento. Só entregas com placa e NF (NF é NOT NULL
 *  em romaneio_pontos). */
export function linhasParaMonitoramentoRQ(entregas: EntregaRioQualityCompleta[]): LinhaMonitoramentoRQ[] {
  return entregas
    .filter(e => e.placaNorm && e.nf)
    .map(e => ({
      placa: e.placaNorm,
      nf: e.nf as string,
      clienteCodigo: e.clienteCodigo ?? '',
      clienteNome: e.clienteNome ?? '',
      enderecoBruto: enderecoBruto(e),
    }))
}

export async function enviarRioQualityAoMonitoramento(
  data: string, linhas: LinhaMonitoramentoRQ[],
): Promise<{ ok: boolean; linhasInseridas?: number; erro?: string }> {
  const chave = process.env.MOTOR_SECRET
  if (!chave) return { ok: false, erro: 'MOTOR_SECRET ausente' }
  try {
    const r = await fetch(`${process.env.MONITORAMENTO_URL ?? 'http://127.0.0.1:3010'}/api/romaneio/rioquality`, {
      method: 'POST',
      headers: { 'x-motor-key': chave, 'content-type': 'application/json', 'x-enviado-por': 'cron-fusion' },
      body: JSON.stringify({ data, linhas }),
      signal: AbortSignal.timeout(20_000),
    })
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; linhasInseridas?: number; erro?: string }
    return j.ok ? { ok: true, linhasInseridas: j.linhasInseridas } : { ok: false, erro: j.erro ?? `HTTP ${r.status}` }
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : String(err) }
  }
}
