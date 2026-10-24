import type { NfAoVivo } from '@/lib/kpi-romaneio/ao-vivo'
import { URL_MONITORAMENTO, caminhoMonitoramento } from '@/lib/sistema-transmonseg'

export type ClienteMonitoramento = 'nutrimax' | 'rioquality'

/** F2-11 (AC-11): "Ver no monitoramento" vale para os dois clientes (antes só
 *  a Nutry). Carga sem placa não tem rastro para mostrar. */
export function mostraVerNoMonitoramento(placa: string): boolean {
  return !!placa && placa !== 'SEM PLACA'
}

/** Tira os "- *" (complemento vazio do romaneio) do endereço. */
export function enderecoLimpo(e: string): string {
  return e.replace(/\s+-\s+\*(?=\s+-|\s*$)/g, '').replace(/\s{2,}/g, ' ').trim()
}

/** Tela "Entrega no mapa" do monitoramento, aberta dentro da Central: rastro
 *  do dia, ponto do cliente e a parada que o KPI contou como entrega.
 *  F2-11: leva a frota (o monitoramento só procura a placa nela) e o "volta"
 *  carrega o cliente -- o X da RQ voltava para a tela da Nutry. */
export function linkMonitoramento(n: NfAoVivo, todas: NfAoVivo[], placa: string, data: string, historico: boolean, cliente: ClienteMonitoramento): string {
  const q = new URLSearchParams({ placa, data, nf: n.nf, cliente: n.cliente, endereco: enderecoLimpo(n.endereco), situacao: n.situacao, status: n.status, frota: cliente })
  if (n.lat != null && n.lng != null) { q.set('lat', String(n.lat)); q.set('lng', String(n.lng)) }
  if (n.parada) { q.set('plat', n.parada.lat.toFixed(6)); q.set('plng', n.parada.lng.toFixed(6)) }
  if (n.chegada) q.set('chegada', n.chegada)
  if (n.saida) q.set('saida', n.saida)
  // A rota inteira da placa: ordem, NF, situação e ponto de cada entrega.
  q.set('pts', todas.map((t, i) => `${i + 1}|${t.nf}|${t.situacao}|${t.lat != null ? t.lat.toFixed(5) : ''}|${t.lng != null ? t.lng.toFixed(5) : ''}|${t.cliente.slice(0, 40).replace(/[|;]/g, ' ')}`).join(';'))
  // Botão X da tela de entrega volta pra cá, no mesmo cliente, placa e NF.
  q.set('volta', `/painel/ao-vivo?${new URLSearchParams({ cliente, placa, nf: n.nf, ...(historico ? { data } : {}) }).toString()}`)
  return `/painel/monitoramento/entrega?${q.toString()}`
}

/** F3-03: mini-mapa da fila "Conferir" -- a mesma tela /entrega do link acima,
 *  aberta num quadro pequeno pela entrada da Central (passe de quem está
 *  logado, como /painel/monitoramento faz). */
export function srcMiniMapa(passe: string, linkPainel: string): string {
  const [caminho, busca] = linkPainel.split('?')
  const alvo = caminhoMonitoramento(caminho) + (busca ? `?${busca}` : '')
  return `${URL_MONITORAMENTO}/api/acessos/entrar-central?p=${encodeURIComponent(passe)}&para=${encodeURIComponent(alvo)}`
}
