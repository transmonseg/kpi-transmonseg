import { driver, type DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'

const TOUR_KEY = 'kpi-dashboard-tour-v1'

const STEPS: DriveStep[] = [
  { element: '[data-tour="titulo"]', popover: { title: 'Bem-vindo ao dashboard', description: 'Em 1 minuto te mostro onde fica cada coisa. Pode fechar quando quiser no X.', side: 'bottom', align: 'start' } },
  { element: '[data-tour="periodo"]', popover: { title: 'Período', description: 'Escolha dia, semana, mês ou ano. Todo o dashboard se ajusta ao que você selecionar aqui.', side: 'bottom', align: 'start' } },
  { element: '[data-tour="resumo"]', popover: { title: 'Como foi a operação', description: 'O resumo: taxa de entrega (o número grande), cobertura de GPS e os tempos médios. As setas comparam com o período anterior.', side: 'top', align: 'start' } },
  { element: '[data-tour="agir"]', popover: { title: 'Onde agir', description: 'Lojas com mais problema e as rotas/lojas mais lentas. Clique no nome de uma loja pra abrir a evolução dela.', side: 'top', align: 'start' } },
  { element: '[data-tour="tendencias"]', popover: { title: 'Tendências', description: 'Entregas por dia, evolução dos tempos e desempenho por rede ao longo do período.', side: 'top', align: 'start' } },
  { element: '[data-tour="relatorio"]', popover: { title: 'Gerar relatório', description: 'Baixa um PDF completo do período: capa, resumo, gráficos e recomendações.', side: 'bottom', align: 'end' } },
  { element: '[data-tour="abas"]', popover: { title: 'Inserir e histórico', description: 'Em "Inserir KPIs" você sobe as planilhas (o mês inteiro de uma vez) e marca cada rede como revisada. Em "Histórico", os dias já lançados.', side: 'bottom', align: 'start' } },
]

export function iniciarTour() {
  const d = driver({
    showProgress: true,
    progressText: '{{current}} de {{total}}',
    nextBtnText: 'Próximo',
    prevBtnText: 'Voltar',
    doneBtnText: 'Entendi',
    animate: true, smoothScroll: true, allowClose: true,
    overlayColor: '#0a0a0a', overlayOpacity: 0.6,
    stagePadding: 8, stageRadius: 14,
    popoverClass: 'driver-popover-navy',
    steps: STEPS,
    onDestroyed: () => { try { localStorage.setItem(TOUR_KEY, 'done') } catch { /* ignore */ } },
  })
  d.drive()
}

export function tourJaVisto(): boolean {
  try { return !!localStorage.getItem(TOUR_KEY) } catch { return true }
}
