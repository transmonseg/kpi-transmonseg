// Sistema Transmonseg (pedido 05/10): central.transmonseg.com.br é o próprio
// painel do KPI, com o Monitoramento aberto dentro dele (/painel/monitoramento).
// kpi.* e monitoramento.* redirecionam pra cá quando abertos no navegador.
export const URL_MONITORAMENTO = 'https://monitoramento.transmonseg.com.br'

/** Telas do monitoramento no menu (caminho dentro do monitoramento). */
export const TELAS_MONITORAMENTO = [
  { caminho: '/central-romaneio', rotulo: 'Central Romaneio' },
  { caminho: '/', rotulo: 'Central' },
  { caminho: '/romaneio', rotulo: 'Configurar Romaneio' },
  { caminho: '/escala', rotulo: 'Escala' },
  { caminho: '/veiculos', rotulo: 'Veículos' },
  { caminho: '/analise', rotulo: 'Análise' },
] as const

/** /painel/monitoramento/central-romaneio -> /central-romaneio */
export function caminhoMonitoramento(pathnamePainel: string): string {
  const resto = pathnamePainel.replace(/^\/painel\/monitoramento/, '')
  return resto === '' ? '/' : resto
}

/** /central-romaneio -> /painel/monitoramento/central-romaneio */
export function rotaPainelMonitoramento(caminho: string): string {
  return caminho === '/' || caminho === '' ? '/painel/monitoramento' : `/painel/monitoramento${caminho.startsWith('/') ? '' : '/'}${caminho}`
}
