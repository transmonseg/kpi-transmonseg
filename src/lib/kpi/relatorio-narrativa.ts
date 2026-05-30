import type { Metricas } from './dashboard-metricas'
import { REDE_LABEL } from './redes'

export interface Narrativa { sumario: string[]; recomendacoes: { titulo: string; corpo: string }[] }

const META_ENTREGA = 95
const fmtMin = (n: number | null | undefined) => n == null ? '—' : `${Math.floor(n / 60)}h${String(Math.round(n % 60)).padStart(2, '0')}`

export function montarNarrativa(m: Metricas, ant: Metricas | null, periodo: string, intervalo: [string, string]): Narrativa {
  const sumario: string[] = []
  const rotuloP = { dia: 'no dia', semana: 'na semana', mes: 'no mês', ano: 'no ano' }[periodo] ?? 'no período'

  // 1. Volume + taxa de entrega vs meta
  const statusTaxa = m.pctEntregue >= META_ENTREGA ? 'dentro da meta' : `abaixo da meta de ${META_ENTREGA}%`
  sumario.push(`Foram ${m.total.toLocaleString('pt-BR')} entregas programadas ${rotuloP}, com taxa de entrega de ${m.pctEntregue}% (${statusTaxa}).`)

  // 2. Comparação vs período anterior
  if (ant && ant.total > 0) {
    const dTaxa = m.pctEntregue - ant.pctEntregue
    const dir = dTaxa > 0 ? 'subiu' : dTaxa < 0 ? 'caiu' : 'ficou estável'
    sumario.push(`A taxa ${dir} ${Math.abs(dTaxa)} ponto(s) percentual(is) vs o período anterior (${ant.pctEntregue}%).`)
  }

  // 3. Rastreamento
  sumario.push(`${m.sem_rastreador} entrega(s) ocorreram sem rastreador (${m.pctSemRastreador}% do total) e ${m.nao_foi} não foram realizadas.`)

  // 4. Tempos
  if (m.tempoMedioTotalMin != null) {
    sumario.push(`O ciclo médio (saída do CD → saída da loja) foi de ${fmtMin(m.tempoMedioTotalMin)}, sendo ${fmtMin(m.tempoMedioRotaMin)} de rota e ${fmtMin(m.tempoMedioLojaMin)} parado em loja.`)
  }

  // 5. Pior rota/loja (exceção concreta)
  const piorRota = m.topRotasDemoradas[0]
  if (piorRota) sumario.push(`A rota mais lenta foi ${piorRota.loja} (${REDE_LABEL[piorRota.rede_id] ?? piorRota.rede_id}), com ${fmtMin(piorRota.tempo_rota)} médios de CD → loja.`)

  // ── Recomendações (por threshold) ──
  const recomendacoes: Narrativa['recomendacoes'] = []
  if (m.pctSemRastreador > 10) recomendacoes.push({ titulo: 'Reduzir entregas sem rastreador', corpo: `${m.pctSemRastreador}% das entregas ficaram sem GPS. Priorizar instalação/manutenção de rastreadores e cadastro no Unitrac pra recuperar visibilidade.` })
  if (m.pctEntregue < META_ENTREGA) recomendacoes.push({ titulo: 'Recuperar a taxa de entrega', corpo: `A taxa (${m.pctEntregue}%) está abaixo da meta de ${META_ENTREGA}%. Investigar as ${m.nao_foi} entregas não realizadas e as lojas com mais ocorrências.` })
  if (m.topRotasDemoradas[0] && (m.topRotasDemoradas[0].tempo_rota ?? 0) > 240) recomendacoes.push({ titulo: 'Otimizar as rotas críticas', corpo: `As rotas mais lentas passam de 4h de CD → loja. Rever roteirização, janelas de saída e consolidação de cargas.` })
  if (recomendacoes.length === 0) recomendacoes.push({ titulo: 'Manter o desempenho', corpo: 'Os indicadores estão dentro das metas no período. Manter o acompanhamento.' })

  return { sumario, recomendacoes }
}
