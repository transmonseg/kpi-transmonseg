// Entregas do Ao vivo -> presenca no monitoramento (07/11). O desvio da
// Central Romaneio so' tira cliente dos "pendentes" com presenca confirmada;
// nota entregue com o ponto do romaneio fora do lugar ficava pendente e o
// caminhao voltando pra base virava "afastando de todos" (06/11: 54 de 147
// desvios da Nutry com todos os pendentes ja' entregues aqui). Fail-open:
// falha so' vira log, o Ao vivo segue.

type NfResultado = { nf?: unknown; situacao?: unknown; chegada?: unknown }
type ResultadoAoVivo = { placas?: { placa?: unknown; nfs?: NfResultado[] }[] } | null | undefined

export type EntregaPresenca = { nf: string; placa: string; chegada: string | null }

/** So' situacao 'entregue' (sem rastreador / fora da conta nao contam: nao ha prova). */
export function entregasParaPresenca(resultado: ResultadoAoVivo): EntregaPresenca[] {
  const out: EntregaPresenca[] = []
  for (const p of resultado?.placas ?? []) {
    if (typeof p?.placa !== 'string' || !p.placa) continue
    for (const n of p.nfs ?? []) {
      if (n?.situacao !== 'entregue' || typeof n.nf !== 'string' || !n.nf || n.nf.startsWith('SEMNF')) continue
      out.push({ nf: n.nf, placa: p.placa, chegada: typeof n.chegada === 'string' ? n.chegada : null })
    }
  }
  return out
}

export async function enviarPresencaAoMonitoramento(
  data: string,
  entregas: EntregaPresenca[],
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: boolean; gravadas?: number; erro?: string }> {
  if (entregas.length === 0) return { ok: true, gravadas: 0 }
  const chave = process.env.MOTOR_SECRET
  if (!chave) return { ok: false, erro: 'MOTOR_SECRET ausente' }
  const base = process.env.MONITORAMENTO_URL ?? 'http://127.0.0.1:3010'
  try {
    const r = await fetchFn(`${base}/api/romaneio/presenca-kpi`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-motor-key': chave },
      body: JSON.stringify({ data, entregas }),
      signal: AbortSignal.timeout(60_000),
    })
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; gravadas?: number; erro?: string }
    return j.ok ? { ok: true, gravadas: j.gravadas } : { ok: false, erro: j.erro ?? `HTTP ${r.status}` }
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : String(err) }
  }
}
