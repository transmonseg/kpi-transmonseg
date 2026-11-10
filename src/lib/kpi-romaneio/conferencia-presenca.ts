// 09/11: nota confirmada pela operação vira presença no monitoramento na hora
// (o desvio da Central Romaneio para de cobrar o cliente sem esperar o tick).
import { enviarPresencaAoMonitoramento } from './presenca-monitoramento'
import { RESOLUCOES_CONFIRMATORIAS } from './resolucoes-regras'
import type { ResolucaoNf } from './types'

export async function presencaDaConferencia(data: string, nf: string, placa: string, chegada: string | null, resolucao: ResolucaoNf): Promise<void> {
  if (!RESOLUCOES_CONFIRMATORIAS.has(resolucao) || !placa || placa === 'SEM PLACA') return
  const r = await enviarPresencaAoMonitoramento(data, [{ nf, placa, chegada }])
  if (!r.ok) console.error(`[conferencia] presença no monitoramento NF ${nf}: ${r.erro}`)
}
