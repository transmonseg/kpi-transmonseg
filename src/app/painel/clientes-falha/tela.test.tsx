import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ClientesFalhaPage from './page'
import { ListaClientesView, PainelClienteView } from './clientes-falha-tela'
import type { PainelCompleto } from '@/lib/kpi-romaneio/ponto-cliente-servico'

vi.mock('next/dynamic', () => ({ default: () => () => null }))

// F4-07 (GEO-24, ACH-07, D-08): resumo -> painel. Casos reais de 24/10.
const LISTA = {
  dias: ['2026-10-05', '2026-10-23'], admin: false,
  clientes: [{ codigo: '6044', nome: 'GASPERI GRILL', endereco: 'ESTRADA PREFEITO WILSON PEDRO FRANCISCO, 560 - ILHA DA MADEIRA, ITAGUAI', dias: 7, diasFalha: 7, diasFalhaPonto: 7,
    motivos: [{ motivo: 'Coordenada imprecisa', dias: 7 }], ultimaFalha: '2026-10-23', ultimoStatus: 'ENDEREÇO COM COORDENADA IMPRECISA', local: null }],
}
const PAINEL = {
  codigo: '163983', nome: 'CHURRASCARIA JACARE', endereco: 'RODOVIA PRESIDENTE JOAO GOULART, S/N - APERIBÉ, APERIBE - ANEXO - 28495521',
  pontoAtual: { lat: -22.3736899, lng: -42.5470193, data: '2026-10-23' },
  local: { chave: '163983', lat: -21.638572, lng: -42.099901, raioM: null, fonte: 'entrega_confirmada', confirmacoes: 5, enderecoRef: null },
  paradas: [
    { id: 'parada:-21.63810,-42.09926', lat: -21.638098, lng: -42.099263, dias: ['2026-10-07', '2026-10-15', '2026-10-22'], paradas: 3, minutosMediana: 7, distPontoAtualM: 93920, ruaConfere: true, ruaDistM: 35, territorio: 'ok' },
    { id: 'parada:-21.66432,-42.08865', lat: -21.664322, lng: -42.088648, dias: ['2026-10-07', '2026-10-15', '2026-10-22'], paradas: 3, minutosMediana: 9, distPontoAtualM: 91948, ruaConfere: false, ruaDistM: 2400 },
    { id: 'parada:-22.58305,-43.97197', lat: -22.583053, lng: -43.971974, dias: ['2026-10-07', '2026-10-16'], paradas: 2, minutosMediana: 8, distPontoAtualM: 60000, ruaConfere: true, ruaDistM: 111, territorio: 'municipio_divergente' },
  ],
  cadastros: [], nfs: [{ data: '2026-10-22', placa: 'RBI0J25', nf: '2436616', situacao: 'revisar', status: 'ENDEREÇO COM COORDENADA IMPRECISA', categoria: 'Coordenada imprecisa', lat: -22.37, lng: -42.54, endereco: 'X', falha: true }],
  correcoes: [], correcaoLiberada: false, ruaConferida: true,
} as unknown as PainelCompleto

describe('Clientes que sempre falham (tela)', () => {
  it('a página passa o cliente do searchParams; código inválido vira a lista', async () => {
    const el = await ClientesFalhaPage({ searchParams: Promise.resolve({ codigo: '163983' }) })
    expect((el as { props: Record<string, unknown> }).props).toMatchObject({ codigoInicial: '163983' })
    const el2 = await ClientesFalhaPage({ searchParams: Promise.resolve({ codigo: '1; drop' }) })
    expect((el2 as { props: Record<string, unknown> }).props).toMatchObject({ codigoInicial: null })
  })
  it('lista: GASPERI GRILL com 7 de 7 dias e o motivo', () => {
    const html = renderToStaticMarkup(<ListaClientesView r={LISTA} erro={null} onAbrir={() => {}} />)
    expect(html).toContain('GASPERI GRILL')
    expect(html).toContain('de 7 dias')
    expect(html).toContain('Coordenada imprecisa (7)')
  })
  it('painel: parada com a rua do CNEFE batendo habilita; a outra não; sem migration avisa e não deixa gravar', () => {
    const html = renderToStaticMarkup(<PainelClienteView p={PAINEL} admin={false} erro={null} aviso={null} setAviso={() => {}} onVoltar={() => {}} enviar={async () => null} />)
    expect(html).toContain('CHURRASCARIA JACARE')
    expect(html).toContain('falta aplicar a migration')
    expect(html).toContain('Rua do endereço no CNEFE a 35 m')
    expect(html).toContain('A rua do endereço não passa por essa parada no CNEFE')
    expect(html).toContain('Fica fora do município do endereço')
    expect(html).not.toContain('Marcar no mapa')
    // Sem a trilha, todo botão de correção fica desabilitado.
    expect((html.match(/disabled=""/g) ?? []).length).toBeGreaterThanOrEqual(3)
  })
  it('admin vê "Marcar no mapa"', () => {
    const html = renderToStaticMarkup(<PainelClienteView p={{ ...PAINEL, correcaoLiberada: true }} admin erro={null} aviso={null} setAviso={() => {}} onVoltar={() => {}} enviar={async () => null} />)
    expect(html).toContain('Marcar no mapa')
  })
})
