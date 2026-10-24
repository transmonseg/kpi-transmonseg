// Sistema Transmonseg (pedido 05/10): central.transmonseg.com.br é o próprio
// painel do KPI, com o Monitoramento aberto dentro dele (/painel/monitoramento).
// kpi.* e monitoramento.* redirecionam pra cá quando abertos no navegador.
export const URL_MONITORAMENTO = 'https://monitoramento.transmonseg.com.br'

/** F3-12 (AC-08): o botão "Monitoramento" abre a Central Romaneio. A Central
 *  Unitrac (a página de 76 MB) fica na engrenagem do monitoramento. */
export const ROTA_INICIO_MONITORAMENTO = '/painel/monitoramento/central-romaneio'

/** /painel/monitoramento/central-romaneio -> /central-romaneio */
export function caminhoMonitoramento(pathnamePainel: string): string {
  const resto = pathnamePainel.replace(/^\/painel\/monitoramento/, '')
  return resto === '' ? '/' : resto
}

/** /central-romaneio -> /painel/monitoramento/central-romaneio */
export function rotaPainelMonitoramento(caminho: string): string {
  return caminho === '/' || caminho === '' ? '/painel/monitoramento' : `/painel/monitoramento${caminho.startsWith('/') ? '' : '/'}${caminho}`
}
