// Empresas atendidas pelo sistema de KPI (cada uma com seu próprio pipeline).
// Portefrio ainda não tem nenhuma tela — só existe como valor atribuível a um
// login, pra não precisar mexer no modelo de dados de novo quando a tela existir.
export const EMPRESAS = ['benassi', 'nutrimax', 'portefrio', 'rioquality'] as const

export const EMPRESA_LABEL: Record<string, string> = {
  benassi: 'Benassi',
  nutrimax: 'Nutry Max',
  portefrio: 'Portefrio',
  rioquality: 'Rio Quality',
}
