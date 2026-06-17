import type { Metricas } from './dashboard-metricas'
import { REDE_LABEL } from './redes'
import { conferiveis, foraConferencia, visibilidadeGps } from '@/lib/relatorio/derivados'

export interface Narrativa { sumario: string[]; recomendacoes: { titulo: string; corpo: string }[] }

const META_ENTREGA = 95
const fmtMin = (n: number | null | undefined) =>
  n == null ? 's/d' : `${Math.floor(n / 60)}h${String(Math.round(n % 60)).padStart(2, '0')}`

export function montarNarrativa(m: Metricas, ant: Metricas | null, periodo: string, _intervalo: [string, string]): Narrativa {
  const sumario: string[] = []
  const rotuloP = { dia: 'no dia', semana: 'na semana', mes: 'no mês', ano: 'no ano' }[periodo] ?? 'no período'
  const conf = conferiveis(m)
  const fora = foraConferencia(m)
  const vis = visibilidadeGps(m)

  // 1. Entregas confirmadas sobre as conferíveis (não sobre o total).
  const statusTaxa = m.pctEntregue >= META_ENTREGA ? 'dentro da meta' : `abaixo da meta de ${META_ENTREGA}%`
  sumario.push(`Foram ${m.total.toLocaleString('pt-BR')} entregas ${rotuloP}. Das ${conf.toLocaleString('pt-BR')} conferíveis, ${m.entregue.toLocaleString('pt-BR')} foram concluídas: taxa de ${m.pctEntregue}% (${statusTaxa}).`)

  // 2. Visibilidade e o que ficou fora da conferência.
  sumario.push(`A visibilidade por GPS cobriu ${vis}% da operação. ${fora.toLocaleString('pt-BR')} linha(s) ficaram fora da conferência: ${m.sem_rastreador} sem rastreador e ${m.indefinido} em análise.`)

  // 3. Comparação vs período anterior.
  if (ant && ant.total > 0) {
    const dTaxa = m.pctEntregue - ant.pctEntregue
    const dir = dTaxa > 0 ? 'subiu' : dTaxa < 0 ? 'caiu' : 'ficou estável'
    sumario.push(`A taxa ${dir} ${Math.abs(dTaxa)} ponto(s) percentual(is) vs o período anterior (${ant.pctEntregue}%).`)
  }

  // 4. Tempos.
  if (m.tempoMedioTotalMin != null) {
    sumario.push(`O ciclo médio (da saída do CD até a saída da loja) foi de ${fmtMin(m.tempoMedioTotalMin)}, sendo ${fmtMin(m.tempoMedioRotaMin)} de rota e ${fmtMin(m.tempoMedioLojaMin)} parado em loja.`)
  }

  // 5. Pior rota (exceção concreta).
  const piorRota = m.topRotasDemoradas[0]
  if (piorRota) sumario.push(`A rota mais lenta foi ${piorRota.loja} (${REDE_LABEL[piorRota.rede_id] ?? piorRota.rede_id}), com ${fmtMin(piorRota.tempo_rota)} médios de CD a loja.`)

  // ── Recomendações (por threshold) ──
  const recomendacoes: Narrativa['recomendacoes'] = []
  if (m.pctSemRastreador > 10) recomendacoes.push({ titulo: 'Aumentar a visibilidade por GPS', corpo: `${m.pctSemRastreador}% das entregas ficaram sem rastreador. Priorizar instalação e manutenção de rastreadores e o cadastro no Unitrac recupera visibilidade e tira essas linhas da incerteza.` })
  const pctIndef = m.total ? Math.round((100 * m.indefinido) / m.total) : 0
  if (pctIndef > 15) recomendacoes.push({ titulo: 'Investigar as linhas em análise', corpo: `${pctIndef}% das linhas ficaram em análise (sem legenda nem horário no relatório de origem). Padronizar o preenchimento da escala fecha essa lacuna e dá uma taxa sobre base maior.` })
  if (m.pctEntregue < META_ENTREGA) recomendacoes.push({ titulo: 'Recuperar a taxa de entrega', corpo: `A taxa (${m.pctEntregue}%) está abaixo da meta de ${META_ENTREGA}%. Investigar as ${m.nao_foi} entregas não realizadas e as lojas com mais ocorrências.` })
  if (m.topRotasDemoradas[0] && (m.topRotasDemoradas[0].tempo_rota ?? 0) > 240) recomendacoes.push({ titulo: 'Otimizar as rotas críticas', corpo: `As rotas mais lentas passam de 4h de CD a loja. Rever roteirização, janelas de saída e consolidação de cargas.` })
  if (recomendacoes.length === 0) recomendacoes.push({ titulo: 'Manter o desempenho', corpo: 'Os indicadores estão dentro das metas no período. Manter o acompanhamento.' })

  return { sumario, recomendacoes }
}
