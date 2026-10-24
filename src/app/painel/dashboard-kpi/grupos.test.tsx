import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { agregarPor, chaveGrupo, pioresRecorrentes } from './calculos'
import { PioresRecorrentes, SeletorVisao, TabelaGrupos } from './grupos'
import type { DiaKpi } from '@/lib/kpi-romaneio/dashboard-kpis'
import fx from './__fixtures__/dashboard-nutry-2026-10.json'

// F3-10: a tela "Por rota" mostra a rota com todas as placas e o dia a dia.
type Linha = [string, string, string, string, number, number, number, number]
const dias: DiaKpi[] = (fx.dias as unknown as { data: string; aguardando: number; cargas: Linha[] }[]).map(d => ({
  data: d.data, arquivoNome: null, inseridoPor: null, inseridoEm: '',
  resumo: {
    versao: 1, taxa: null, nfsNaConta: null, entregues: null, pendentes: 0, semRastreador: 0, aguardando: d.aguardando, foraDaConta: null, motivos: {},
    cargas: d.cargas.map(([carga, placa, destino, motorista, nfPlanejado, nfConfirmadas, nfForaDaConta]) => ({
      carga, placa, destino, motorista, nfPlanejado, nfConfirmadas, nfForaDaConta, km: null, saida: null, chegada: null, tempoOperacaoMin: null, tempoMedioMin: null,
    })),
  },
}))

describe('F3-10: telas Por rota / Por motorista', () => {
  it('abas com os nomes pedidos', () => {
    const html = renderToStaticMarkup(<SeletorVisao visao="rota" onTrocar={() => {}} />)
    expect(html).toContain('Por placa')
    expect(html).toContain('Por rota')
    expect(html).toContain('Por motorista')
    expect(html).toMatch(/aria-selected="true"[^>]*>Por rota/)
  })

  it('outubro por rota: linha DUQUE DE CAXIAS 2 com 82,6%, 303/367, as 4 placas e o dia a dia aberto', () => {
    const rotas = agregarPor(dias, 'rota')
    const html = renderToStaticMarkup(
      <TabelaGrupos grupos={rotas} por="rota" umDia={false} meta={97} aberto={chaveGrupo('DUQUE DE CAXIAS 2')} onAbrir={() => {}} />,
    )
    const i = html.indexOf('DUQUE DE CAXIAS 2')
    expect(i).toBeGreaterThan(-1)
    const linha = html.slice(i, html.indexOf('</tr>', i))
    expect(linha).toContain('82,6%')
    expect(linha).toContain('303')
    expect(linha).toContain('/367')
    expect(linha).toContain('TTM2G01, RQV9B26, RQS7H76, RQV0E64')
    expect(html).toContain('Tendência semanal')
    // dia a dia (aberto): 22/10 RQV9B26 19/23
    expect(html).toMatch(/22\/10<\/b>[^]*?RQV9B26[^]*?19\/23/)
  })

  it('piores rotas recorrentes: DUQUE DE CAXIAS 2 primeiro, 5 de 5 dias abaixo', () => {
    const lista = pioresRecorrentes(agregarPor(dias, 'rota'), 97)
    const html = renderToStaticMarkup(<PioresRecorrentes lista={lista} meta={97} onAbrir={() => {}} />)
    expect(html.indexOf('DUQUE DE CAXIAS 2')).toBeLessThan(html.indexOf('CACHOEIRA DE MACACU'))
    expect(html).toContain('5 de 5 dias abaixo · 4 placas')
    expect(html).toContain(`Ver todas (${lista.length})`)
  })
})
