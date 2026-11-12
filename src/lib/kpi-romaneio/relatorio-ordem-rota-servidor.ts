// 12/11: carrega os dias do período com ordem guardada e monta o relatório.
import { hojeBR } from '@/lib/data-br'
import { lerEstadoAoVivo } from './ao-vivo-servico'
import { lerDiaHistorico } from './ao-vivo-historico'
import { comConferencias } from './ao-vivo-conferencia-servidor'
import { aplicarOrdemRota } from './ordem-rota'
import { enviosDeOrdem, lerOrdemRota, type EnvioOrdem } from './ordem-rota-servidor'
import { montarRelatorioOrdemRota, type DiaComOrdem, type RelatorioOrdemRota } from './relatorio-ordem-rota'

export const MAX_DIAS_PERIODO = 62
const CLIENTE = 'rioquality' as const

export function periodoValido(de: string | null, ate: string | null, hoje: string): { de: string; ate: string } | string {
  const iso = /^\d{4}-\d{2}-\d{2}$/
  const d = de ?? hoje, a = ate ?? d
  if (!iso.test(d) || !iso.test(a)) return 'Data inválida.'
  if (d > a) return 'O início do período é depois do fim.'
  if (a > hoje) return 'O período não pode passar de hoje.'
  const dias = (Date.parse(a) - Date.parse(d)) / 86_400_000 + 1
  if (dias > MAX_DIAS_PERIODO) return `Período de no máximo ${MAX_DIAS_PERIODO} dias.`
  return { de: d, ate: a }
}

export type RespostaOrdemRota = RelatorioOrdemRota & { semCalculo: string[]; envios: EnvioOrdem[] }

export async function relatorioOrdemRota(de: string, ate: string): Promise<RespostaOrdemRota> {
  const hoje = hojeBR()
  const dias: DiaComOrdem[] = []
  const semCalculo: string[] = []
  // Um dia por vez: cada resultado do Ao vivo tem ~1 MB.
  const envios = await enviosDeOrdem(CLIENTE, de, ate)
  for (const { data } of envios) {
    const bruto = data === hoje ? (await lerEstadoAoVivo(CLIENTE, data)).resultado : (await lerDiaHistorico(CLIENTE, data))?.resultado ?? null
    if (!bruto) { semCalculo.push(data); continue }
    const r = await comConferencias(CLIENTE, data, bruto)
    const { linhas } = await lerOrdemRota(CLIENTE, data)
    const planejadas: Record<string, number> = {}
    for (const l of linhas) planejadas[l.romaneio] = (planejadas[l.romaneio] ?? 0) + 1
    dias.push({ data, planejadas, placas: aplicarOrdemRota(r!, linhas).placas as DiaComOrdem['placas'] })
  }
  return { ...montarRelatorioOrdemRota(dias, de, ate), semCalculo, envios }
}
