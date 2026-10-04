// Capítulos do tutorial guiado (tour custom com motion — sem driver.js).
// Cada capítulo é uma TELA; ao trocar de capítulo o tour navega sozinho.
// Redesign 04/10/2026: tour curto das telas novas (Dashboard por cliente,
// Gerar KPI, Histórico, Usuários). A Benassi saiu (cadeado no menu).
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
  {
    href: '/painel?cliente=nutrimax', pathname: '/painel',
    steps: [
      s('[data-tour="dash-clientes"]', 'Escolha o cliente', 'Nutry Max, Rio Quality ou Portefrio. O painel de baixo troca na hora para o cliente escolhido.'),
      s('[data-tour="dash-periodo"]', 'Período', 'Últimos 7, 14 ou 30 dias. As médias e os gráficos seguem o que você marcar.', 'left'),
      s('[data-tour="dash-dia"]', 'O dia em destaque', 'Taxa de confirmação do dia, a variação contra o dia anterior, pendentes, sem rastreador, cargas e KM rodados.'),
      s('[data-tour="dash-grafico"]', 'Dia a dia', 'A linha verde tracejada é a meta de 95%. Clique em qualquer dia para ver os detalhes dele.', 'top'),
      s('[data-tour="dash-placas"]', 'Placas do dia', 'Cada caminhão: NFs confirmadas, KM, saída e volta ao CD, tempo de operação e tempo por entrega. Clique no cabeçalho para ordenar.', 'top'),
      s('[data-tour="dash-gerar"]', 'Gerar o KPI', 'Daqui você sobe os arquivos do dia. Cada KPI gerado alimenta este dashboard sozinho.', 'left'),
    ],
  },
  {
    href: '/painel/nutrimax/gerar', pathname: '/painel/nutrimax/gerar',
    steps: [
      s('[data-tour="nm-arquivos"]', 'Os arquivos do dia', 'Escala de Rota (opcional), Romaneio de Entrega, a data e, se tiver, o Romaneio do Pão. Arraste ou clique para escolher.'),
      s('[data-tour="nm-gerar"]', 'Gerar', 'Com os arquivos no lugar, é só gerar. A planilha baixa sozinha e fica salva no histórico.', 'top'),
    ],
  },
  {
    href: '/painel/nutrimax/historico', pathname: '/painel/nutrimax/historico',
    steps: [
      s('[data-tour="hist-tabela"]', 'Histórico', 'Cada geração com a taxa do dia. "Parcial" é KPI gerado com a rota ainda em andamento. Baixe a planilha salva ou regere com as correções mais recentes.', 'top'),
    ],
  },
  {
    href: '/painel/usuarios', pathname: '/painel/usuarios',
    steps: [
      s('[data-tour="usr-novo"]', 'Novo acesso', 'Escolha o tipo de login e a empresa e gere o link de convite. A pessoa entra direto no dashboard dela.', 'right'),
      s('[data-tour="usr-lista"]', 'Quem tem acesso', 'Os acessos de cada empresa. Dá pra revogar quando quiser.', 'left'),
    ],
  },
  {
    href: '/painel?cliente=nutrimax', pathname: '/painel',
    steps: [
      s('[data-tour="dash-clientes"]', 'Pronto!', 'Esse é o sistema. Para rever este tutorial, use o botão "Tutorial" no topo do dashboard.'),
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
