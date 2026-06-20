// Capítulos do tutorial guiado (tour custom com motion — sem driver.js).
// Cada capítulo é uma TELA; ao trocar de capítulo o tour navega sozinho.
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
  // 0 ─ Dashboard: o sistema inteiro num lugar
  {
    href: '/painel', tab: 'geral', pathname: '/painel',
    steps: [
      s('[data-tour="titulo"]', 'Bem-vindo! 👋', 'Vou te mostrar o sistema inteiro: ver os números, subir e gerar os KPIs, consultar o histórico e os cadastros. Pode fechar no ✕ a qualquer momento.'),
      s('[data-tour="relatorio"]', 'Relatório em PDF', 'Gera um relatório completo do período, com gráficos e análise, pra baixar ou enviar.'),
      s('[data-tour="abas"]', 'As três abas', 'Visão geral (os números), Inserir KPIs (subir as planilhas) e Histórico (gerações salvas). Já passo por todas.'),
      s('[data-tour="periodo"]', 'Escolha o período', 'Dia, semana, mês, ano — ou "Período" pra um intervalo personalizado (de–até). Por padrão abre no mês. Tudo no dashboard se ajusta ao que você marcar aqui; no modo "Dia" use as setinhas ‹ › pra pular de um dia pro outro.'),
      s('[data-tour="filtro-redes"]', 'Filtrar por rede', 'Por padrão mostra todas as redes. Abra aqui pra ver só as que te interessam — o dashboard inteiro recalcula só com elas.', 'left'),
      s('[data-tour="resumo-exec"]', 'O resumo em 1 frase', 'O período inteiro numa linha, com o semáforo de meta (🟢 na meta · 🟡 atenção · 🔴 abaixo). É o "como estamos" de 3 segundos.'),
      s('[data-tour="alertas"]', 'Alertas automáticos', 'O sistema acha sozinho os pontos mais críticos do período (taxa abaixo da meta, queda, rede ruim) e destaca aqui. Se estiver tudo dentro da meta, ele também te diz.'),
      s('[data-tour="resumo-taxa"]', 'Taxa de entrega', 'O número que manda na tela: quantas das entregas programadas foram concluídas. A seta compara com o período anterior.', 'right'),
      s('[data-tour="resumo-secundarios"]', 'O resto do status', 'Quanto não foi ao cliente, a cobertura de GPS e o total de entregas no período.'),
      s('[data-tour="resumo-tempos"]', 'Tempos médios', 'Tempo de rota (do CD até a loja), tempo parado na loja e o tempo total da operação.', 'top'),
      s('[data-tour="agir-tabela"]', 'Lojas com mais problema', 'As lojas que mais tiveram falha de GPS ou entrega não realizada. Clique no nome de uma loja pra abrir a evolução dela ao longo do tempo.', 'top'),
      s('[data-tour="agir-paineis"]', 'Sem rastreador e não foi', 'Os dois números que mais doem, em destaque, com o percentual sobre o total.', 'left'),
      s('[data-tour="agir-lentos"]', 'Rotas e lojas mais lentas', 'Onde atacar: as rotas que mais demoram do CD até a loja e os clientes onde o caminhão fica mais tempo parado.', 'top'),
      s('[data-tour="risco"]', 'Segurança da carga', 'As paradas indevidas do período: veículo parado 10min ou mais fora de loja e da base — o principal sinal de risco da carga. O mapa mostra onde aconteceram, com a cor pela gravidade (amarelo, laranja, vermelho) e a bolha maior quanto mais tempo parado. Clique num ponto pra ver placa, tempo e horário. E no ⓘ ao lado dos números abre a explicação de cada um.', 'top'),
      s('[data-tour="tendencias-serie"]', 'Entregas por dia', 'O volume diário no período, separado por entregue, não foi e sem rastreador.', 'top'),
      s('[data-tour="tendencias-tempos"]', 'Evolução e horários', 'Como os tempos médios evoluíram dia a dia e em que horas os caminhões saem do CD.', 'top'),
      s('[data-tour="tendencias-comparativo"]', 'Tempo médio por rede', 'Compare as redes por tempo de rota, em loja ou total (use os botões pra trocar a métrica).', 'top'),
      s('[data-tour="tendencias-rede"]', 'Desempenho e turnos', 'A taxa de entrega de cada rede e o volume distribuído por turno do dia.', 'top'),
      s('[data-tour="tendencias-motoristas"]', 'Visão por motorista', 'Os motoristas com mais entregas no período e seus tempos médios de rota e de loja.', 'top'),
      s('[data-tour="tendencias-export"]', 'Baixar KPI mensal', 'Um atalho pra baixar a planilha de KPI do mês, por rede.', 'top'),
    ],
  },
  // 1 ─ Inserir KPIs (planilhas mensais da Tia)
  {
    href: '/painel?tab=inserir', tab: 'inserir', pathname: '/painel',
    steps: [
      s('[data-tour="ins-modo"]', 'Inserir os KPIs', 'Aqui você sobe as planilhas de KPI. Em "Mês inteiro" o sistema lê todas as abas-dia da planilha de uma vez.'),
      s('[data-tour="ins-periodo"]', 'Escolha o mês', 'Selecione o mês das planilhas. É a data que vai carimbar os dados.'),
      s('[data-tour="ins-grid"]', 'Suba por rede', 'Cada rede tem seu botão Enviar. Subir de novo a mesma rede regera aquele mês (substitui o anterior). No modo "Dia específico" aparece também o "Fechar revisão" por rede.', 'top'),
    ],
  },
  // 2 ─ Gerar KPI (escala + Unitrac)
  {
    href: '/painel/kpi/simples', pathname: '/painel/kpi/simples',
    steps: [
      s('[data-tour="gk-escala"]', 'Gerar o KPI do zero', 'Esta tela cruza a escala com o relatório do Unitrac. Comece subindo a(s) escala(s) aqui.'),
      s('[data-tour="gk-unitrac"]', 'Suba o Unitrac', 'O relatório do rastreador (PDF). É ele que dá os horários reais de cada parada.', 'top'),
      s('[data-tour="gk-alteracoes"]', 'Alterações da escala', 'As mudanças que chegaram por texto e não estão na planilha (troca de motorista, de veículo, etc). Cole o texto ou adicione manualmente aqui pra elas entrarem no KPI antes de gerar.', 'top'),
      s('[data-tour="gk-gerar"]', 'Gere', 'Com escala, Unitrac, alterações e data, clique pra gerar. O sistema cruza tudo e monta o KPI por rede.', 'top'),
      s('[data-tour="gk-resultado"]', 'Confira e baixe', 'O resultado sai por rede (XLSX e PDF). Antes de baixar, a prévia mostra cada linha em 3 níveis: ✅ confirmado (pode confiar), 🟡 conferir (2ª rota, idas e vindas) e ❌ não entregou — sempre com o motivo do lado, e como casou (código/nome/geo). Se aparecer um código novo do Unitrac sem cadastro, um aviso azul te avisa pra cadastrar. Pra regerar, suba os arquivos de novo ou use o "Re-gerar".', 'top'),
    ],
  },
  // 3 ─ Histórico de gerações
  {
    href: '/painel/historico', pathname: '/painel/historico',
    steps: [
      s('[data-tour="hist-filtro"]', 'Gerações salvas', 'Todo KPI gerado fica guardado aqui. Use os filtros de data pra encontrar uma geração específica.'),
      s('[data-tour="hist-tabela"]', 'A lista', 'Cada linha é uma geração, com o resumo de redes, rotas, falhas de GPS e anomalias.', 'top'),
      s('[data-tour="hist-regerar"]', 'Regerar', 'Por aqui você reabre uma geração antiga pra gerar de novo, caso tenha feito correções.', 'bottom'),
    ],
  },
  // 4 ─ Catálogo de lojas
  {
    href: '/painel/lojas', pathname: '/painel/lojas',
    steps: [
      s('[data-tour="lojas-busca"]', 'Catálogo de lojas', 'Todas as lojas cadastradas. Busque pelo nome pra achar rápido.'),
      s('[data-tour="lojas-nova"]', 'Nova loja', 'Cadastre uma loja nova com rede, nome e os códigos da escala e do Unitrac.', 'bottom'),
      s('[data-tour="lojas-tabela"]', 'A tabela', 'Edite ou exclua qualquer loja. Os códigos daqui são o que ligam a loja à escala e ao rastreador.', 'top'),
    ],
  },
  // 5 ─ Cozinha (escala e rotas)
  {
    href: '/painel/cozinha', pathname: '/painel/cozinha',
    steps: [
      s('[data-tour="coz-upload"]', 'Cozinha: a escala', 'Suba aqui a planilha da escala da cozinha pra processar as rotas do dia.'),
      s('[data-tour="coz-processar"]', 'Processar a escala', 'Escolha o arquivo e a data, clique aqui e o sistema monta as rotas do dia. Aí aparece a tabela de rotas, onde você altera o motorista e a placa de cada uma e exporta em XLSX ou PDF.', 'top'),
      s('[data-tour="coz-rotas"]', 'As rotas e as alterações', 'Cada linha é uma rota. Edite o motorista e a placa direto na tabela e clique em "Salvar edições" antes de exportar.', 'top'),
    ],
  },
  // 6 ─ Clientes da cozinha
  {
    href: '/painel/cozinha/clientes', pathname: '/painel/cozinha/clientes',
    steps: [
      s('[data-tour="cli-busca"]', 'Clientes da cozinha', 'O cadastro de clientes que abastece a escala da cozinha. Busque por empresa, nome ou código.'),
      s('[data-tour="cli-novo"]', 'Novo cliente', 'Cadastre um cliente novo, com endereço, pra geração correta das rotas.', 'bottom'),
      s('[data-tour="cli-tabela"]', 'A tabela', 'Edite endereço, CEP e complemento direto na linha, ou importe vários de uma vez por XLSX.', 'top'),
    ],
  },
  // 7 ─ Fim: de volta ao dashboard
  {
    href: '/painel', tab: 'geral', pathname: '/painel',
    steps: [
      s('[data-tour="titulo"]', 'Pronto! 🎉', 'Esse é o sistema inteiro. Você pode rever este tutorial quando quiser no botão "Ver tutorial". Bom trabalho!'),
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
