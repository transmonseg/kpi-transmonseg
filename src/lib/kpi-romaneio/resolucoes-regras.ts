// Regras da resolucao manual por NF (Task 4, plano 24/09) sem imports de
// servidor: usadas pela planilha (gerador-xlsx.ts) e pela fila "Conferir" do
// Ao vivo (F3-03), que roda no navegador. Antes ficavam dentro do gerador.
import type { ResolucaoNf } from './types'

// Rotulo exibido na planilha pra cada valor do enum de resolucao manual
// (kpi_nf_resolucao.resolucao) -- MAIUSCULO, mesmo padrao visivel do resto do
// relatorio. `entregue_outra_placa` ganha a placa executora ao lado (ver
// textoResolucaoManual em gerador-xlsx.ts).
export const LABEL_RESOLUCAO_NF: Record<ResolucaoNf, string> = {
  entregue: 'ENTREGUE',
  entregue_tempo_conferido: 'ENTREGUE - TEMPO DE LOJA CONFERIDO',
  entregue_rastro_oscilante: 'ENTREGUE - RASTRO OSCILANTE',
  entregue_outra_placa: 'ENTREGUE POR OUTRA PLACA',
  nao_esteve_no_local: 'NÃO ESTEVE NO LOCAL',
  desatualizado: 'DESATUALIZADO',
}

// Resolucoes que a operacao registra como "de fato aconteceu" -- contam pra
// taxa "apos conferencia da operacao" mesmo quando o automatico ficou
// pendente. `nao_esteve_no_local`/`desatualizado` NUNCA contam (mesmo se o
// automatico tivesse confirmado por engano -- a palavra da operacao vale
// mais que o GPS/Unitrac nesses dois casos).
export const RESOLUCOES_CONFIRMATORIAS: ReadonlySet<ResolucaoNf> = new Set<ResolucaoNf>([
  'entregue', 'entregue_tempo_conferido', 'entregue_rastro_oscilante', 'entregue_outra_placa',
])

/** Valores aceitos pelo CHECK da migration 20260924000000_kpi_resolucao_nf.sql. */
export const RESOLUCOES_VALIDAS: readonly ResolucaoNf[] = [
  'entregue', 'entregue_tempo_conferido', 'entregue_rastro_oscilante', 'entregue_outra_placa', 'nao_esteve_no_local', 'desatualizado',
]
