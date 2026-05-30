// Capítulos do tutorial guiado (tour custom com motion — sem driver.js).
export type Side = 'top' | 'bottom' | 'left' | 'right'

export interface Passo {
  element: string       // seletor CSS do alvo (data-tour)
  title: string
  description: string
  side: Side            // lado preferido do popover em relação ao alvo
}

export interface Capitulo {
  href: string          // pra onde navegar quando este capítulo começa
  tab?: 'geral' | 'inserir' | 'historico'
  pathname: string      // pathname que identifica a tela (sem query)
  steps: Passo[]
}

const s = (element: string, title: string, description: string, side: Side = 'bottom'): Passo =>
  ({ element, title, description, side })

export const CAPITULOS: Capitulo[] = [
  // 0 — Dashboard / visão geral
  {
    href: '/painel', tab: 'geral', pathname: '/painel',
    steps: [
      s('[data-tour="titulo"]', 'Bem-vindo! 👋', 'Vou te levar pelo sistema inteiro em 1 minuto — ver os números, subir e gerar os KPIs. Pode fechar no ✕ a qualquer momento.'),
      s('[data-tour="periodo"]', 'Escolha o período', 'Dia, semana, mês ou ano. Tudo no dashboard se ajusta ao que você marcar aqui.'),
      s('[data-tour="resumo"]', 'Como foi a operação', 'A taxa de entrega (o número grande), cobertura de GPS e os tempos médios. As setas comparam com o período anterior.', 'bottom'),
      s('[data-tour="agir"]', 'Onde agir', 'Lojas com mais problema e as mais lentas. Clique no nome de uma loja pra abrir a evolução dela ao longo do tempo.', 'top'),
      s('[data-tour="tendencias"]', 'Tendências', 'Os gráficos do período: entregas por dia, evolução dos tempos e desempenho por rede.', 'top'),
      s('[data-tour="relatorio"]', 'Relatório em PDF', 'Gera um relatório completo do período pra baixar ou enviar.', 'bottom'),
    ],
  },
  // 1 — Inserir KPIs (subir as planilhas mensais)
  {
    href: '/painel?tab=inserir', tab: 'inserir', pathname: '/painel',
    steps: [
      s('[data-tour="ins-modo"]', 'Inserir os KPIs', 'Aqui você sobe as planilhas de KPI. Em "Mês inteiro" o sistema lê todas as abas-dia da planilha de uma vez.'),
      s('[data-tour="ins-periodo"]', 'Escolha o mês', 'Selecione o mês das planilhas — é a data que vai carimbar os dados.'),
      s('[data-tour="ins-grid"]', 'Suba por rede', 'Cada rede tem seu botão "Enviar". Subir de novo a mesma rede REGERA aquele mês (substitui o anterior). No modo "Dia específico" aparece também o "Fechar revisão" por rede.', 'top'),
    ],
  },
  // 2 — Gerar KPI (escala + Unitrac)
  {
    href: '/painel/kpi/simples', pathname: '/painel/kpi/simples',
    steps: [
      s('[data-tour="gk-escala"]', 'Gerar o KPI do zero', 'Esta tela CRUZA a escala com o relatório do Unitrac. Comece subindo a(s) escala(s) aqui.'),
      s('[data-tour="gk-unitrac"]', 'Suba o Unitrac', 'O relatório do rastreador (PDF). É ele que dá os horários reais de cada parada.', 'top'),
      s('[data-tour="gk-gerar"]', 'Gere', 'Com escala + Unitrac + data, clique pra gerar. O sistema cruza tudo e monta o KPI por rede.', 'top'),
      s('[data-tour="gk-resultado"]', 'Baixe e regere', 'O resultado sai por rede (XLSX e PDF). Pra regerar tudo, suba os arquivos de novo e gere — ou use "Re-gerar" quando fez correções.', 'top'),
    ],
  },
  // 3 — Volta ao dashboard: fim
  {
    href: '/painel', tab: 'geral', pathname: '/painel',
    steps: [
      s('[data-tour="abas"]', 'Pronto! 🎉', 'Esse é o fluxo completo. Você pode rever este tutorial quando quiser no botão "Ver tutorial". Bom trabalho!'),
    ],
  },
]

/** Total de passos no tour inteiro (pra barra de progresso global). */
export const TOTAL_PASSOS = CAPITULOS.reduce((acc, c) => acc + c.steps.length, 0)

/** Índice global (0-based) do passo `stepIdx` dentro do capítulo `cap`. */
export function indiceGlobal(cap: number, stepIdx: number): number {
  let n = 0
  for (let i = 0; i < cap && i < CAPITULOS.length; i++) n += CAPITULOS[i].steps.length
  return n + stepIdx
}
