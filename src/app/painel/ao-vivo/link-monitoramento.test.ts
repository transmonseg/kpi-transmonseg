import { describe, it, expect } from 'vitest'
import type { NfAoVivo } from '@/lib/kpi-romaneio/ao-vivo'
import { linkMonitoramento, mostraVerNoMonitoramento } from './link-monitoramento'

// F2-11 (AC-11): o botão era só da Nutry e o "volta" ia sem o cliente -- o X
// da tela de entrega levava a RQ para a tela da Nutry. Caso real: RQ 23/10,
// TTU9G22, NF 5558903 (ponto e parada do F2-03).
const nf = (o: Partial<NfAoVivo>): NfAoVivo => ({
  nf: '5558903', carga: '1', cliente: 'SUPERMERCADO X', endereco: 'RUA A, 10 - *', status: 'ENTREGUE', situacao: 'entregue',
  chegada: '09:12', saida: '09:40', tempoMin: 28, lat: -22.81, lng: -43.35, parada: { lat: -22.8101, lng: -43.3502 }, ...o,
})

function partes(link: string) {
  const [caminho, busca] = link.split('?')
  const q = new URLSearchParams(busca)
  const volta = q.get('volta')!
  const [voltaCaminho, voltaBusca] = volta.split('?')
  return { caminho, q, voltaCaminho, voltaQ: new URLSearchParams(voltaBusca) }
}

describe('linkMonitoramento', () => {
  it('RQ: leva a frota e o "volta" carrega o cliente (o X volta para a RQ, mesma placa e NF)', () => {
    const n = nf({})
    const { caminho, q, voltaCaminho, voltaQ } = partes(linkMonitoramento(n, [n], 'TTU9G22', '2026-10-23', true, 'rioquality'))
    expect(caminho).toBe('/painel/monitoramento/entrega')
    expect(q.get('frota')).toBe('rioquality')
    expect(q.get('placa')).toBe('TTU9G22')
    expect(q.get('cliente')).toBe('SUPERMERCADO X') // nome do cliente da NF, como antes
    expect(voltaCaminho).toBe('/painel/ao-vivo')
    expect(voltaQ.get('cliente')).toBe('rioquality')
    expect(voltaQ.get('placa')).toBe('TTU9G22')
    expect(voltaQ.get('nf')).toBe('5558903')
    expect(voltaQ.get('data')).toBe('2026-10-23')
  })
  it('Nutry: mesma URL de antes, mais a frota e o cliente no "volta"; dia de hoje sem data', () => {
    const n = nf({ situacao: 'fora_da_conta', parada: null })
    const { q, voltaQ } = partes(linkMonitoramento(n, [n], 'RQV9B26', '2026-10-24', false, 'nutrimax'))
    expect(q.get('frota')).toBe('nutrimax')
    expect(q.get('situacao')).toBe('fora_da_conta')
    expect(q.get('endereco')).toBe('RUA A, 10')
    expect(q.has('plat')).toBe(false)
    expect(voltaQ.get('cliente')).toBe('nutrimax')
    expect(voltaQ.has('data')).toBe(false)
  })
})

describe('mostraVerNoMonitoramento', () => {
  it('liberado para a RQ e a Nutry; nunca sem placa', () => {
    expect(mostraVerNoMonitoramento('TTU9G22')).toBe(true)
    expect(mostraVerNoMonitoramento('RQV9B26')).toBe(true)
    expect(mostraVerNoMonitoramento('SEM PLACA')).toBe(false)
    expect(mostraVerNoMonitoramento('')).toBe(false)
  })
})

// F3-03: mini-mapa da fila "Conferir" reaproveita a tela /entrega do
// monitoramento, num quadro pequeno, entrando com o passe de quem está logado.
describe('srcMiniMapa', () => {
  it('a mesma tela "Entrega no mapa" do botão, pela entrada da Central', async () => {
    const { srcMiniMapa } = await import('./link-monitoramento')
    const link = linkMonitoramento(nf({}), [nf({})], 'TTU9G22', '2026-10-23', true, 'rioquality')
    const src = srcMiniMapa('PASSE.1', link)
    const u = new URL(src)
    expect(`${u.origin}${u.pathname}`).toBe('https://monitoramento.transmonseg.com.br/api/acessos/entrar-central')
    expect(u.searchParams.get('p')).toBe('PASSE.1')
    const para = u.searchParams.get('para')!
    expect(para.startsWith('/entrega?')).toBe(true)
    expect(new URLSearchParams(para.split('?')[1]).get('nf')).toBe('5558903')
    expect(new URLSearchParams(para.split('?')[1]).get('frota')).toBe('rioquality')
  })
})
