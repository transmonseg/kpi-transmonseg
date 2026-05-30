import type { DriveStep } from 'driver.js'

export interface Capitulo {
  href: string            // pra onde navegar quando este capítulo começa
  tab?: 'geral' | 'inserir' | 'historico'  // aba esperada (só /painel)
  pathname: string        // pathname que identifica a tela (sem query)
  steps: DriveStep[]
}

type Side = 'top' | 'bottom' | 'left' | 'right'

function p(title: string, description: string, side: Side = 'bottom'): DriveStep['popover'] {
  return { title, description, side, align: 'start' }
}

export const CAPITULOS: Capitulo[] = [
  // 0 — Dashboard / visão geral
  {
    href: '/painel', tab: 'geral', pathname: '/painel',
    steps: [
      { element: '[data-tour="titulo"]', popover: p('Bem-vindo!', 'Vou te levar pelo sistema inteiro em 1 minuto: ver os números, subir e gerar os KPIs. Pode fechar no X quando quiser.') },
      { element: '[data-tour="periodo"]', popover: p('1. Escolha o período', 'Dia, semana, mês ou ano. Tudo no dashboard se ajusta ao que você marcar aqui.') },
      { element: '[data-tour="resumo"]', popover: p('2. Como foi a operação', 'A taxa de entrega (número grande), cobertura de GPS e os tempos médios. As setas comparam com o período anterior.', 'top') },
      { element: '[data-tour="agir"]', popover: p('3. Onde agir', 'Lojas com mais problema e as mais lentas. Clique no nome de uma loja pra abrir a evolução dela ao longo do tempo.', 'top') },
      { element: '[data-tour="tendencias"]', popover: p('4. Tendências', 'Os gráficos do período: entregas por dia, evolução dos tempos e desempenho por rede.', 'top') },
      { element: '[data-tour="relatorio"]', popover: p('5. Relatório em PDF', 'Gera um relatório completo do período pra baixar ou enviar.', 'bottom') },
    ],
  },
  // 1 — Inserir KPIs (subir as planilhas mensais)
  {
    href: '/painel?tab=inserir', tab: 'inserir', pathname: '/painel',
    steps: [
      { element: '[data-tour="ins-modo"]', popover: p('6. Inserir os KPIs da Tia', 'Aqui você sobe as planilhas de KPI. Em "Mês inteiro" o sistema lê todas as abas-dia da planilha de uma vez.') },
      { element: '[data-tour="ins-periodo"]', popover: p('7. Escolha o mês', 'Selecione o mês das planilhas. É a data que vai carimbar os dados.') },
      { element: '[data-tour="ins-grid"]', popover: p('8. Suba por rede', 'Cada rede tem seu botão "Enviar". Subir de novo a mesma rede REGERA aquele mês (substitui o que estava lá). No modo "Dia específico" aparece também o "Fechar revisão" por rede.', 'top') },
    ],
  },
  // 2 — Gerar KPI (escala + Unitrac)
  {
    href: '/painel/kpi/simples', pathname: '/painel/kpi/simples',
    steps: [
      { element: '[data-tour="gk-escala"]', popover: p('9. Gerar o KPI do zero', 'Esta é a tela que CRUZA a escala com o relatório do Unitrac. Comece subindo a(s) escala(s) aqui.') },
      { element: '[data-tour="gk-unitrac"]', popover: p('10. Suba o Unitrac', 'O relatório do rastreador (PDF). É ele que dá os horários reais de cada parada.', 'top') },
      { element: '[data-tour="gk-gerar"]', popover: p('11. Gere', 'Com escala + Unitrac + data, clique pra gerar. O sistema cruza tudo e monta o KPI por rede.', 'top') },
      { element: '[data-tour="gk-resultado"]', popover: p('12. Baixe e regere', 'O resultado sai por rede (XLSX e PDF). Pra regerar tudo, é só subir os arquivos de novo e gerar — ou usar o "Re-gerar" quando fez correções.', 'top') },
    ],
  },
  // 3 — Volta ao dashboard: fim
  {
    href: '/painel', tab: 'geral', pathname: '/painel',
    steps: [
      { element: '[data-tour="abas"]', popover: p('Pronto!', 'Esse é o fluxo completo. Você pode rever este tutorial quando quiser no botão "Ver tutorial". Bom trabalho!') },
    ],
  },
]
