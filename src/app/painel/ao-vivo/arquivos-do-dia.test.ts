import { describe, it, expect } from 'vitest'
import { juntarReconhecidos, montarEnvio, respostaArquivoDesconhecido, type ItemArquivo } from './arquivos-do-dia'
import type { ArquivoNoRecibo } from '@/lib/kpi-romaneio/reconhecer-arquivo'

const info = (campo: ArquivoNoRecibo['campo'], serve = true, cliente: ArquivoNoRecibo['cliente'] = 'nutrimax'): ArquivoNoRecibo =>
  ({ nome: 'x', tipo: 'romaneio_entrega', cliente, campo, data: '2026-10-23', contagens: {}, resumo: 'x', serve })
const item = (id: string, i: ArquivoNoRecibo | null): ItemArquivo => ({ id, file: new File(['x'], `${id}.pdf`), info: i })

describe('área "Solte os arquivos do dia" (F3-06)', () => {
  it('os 3 PDFs da Nutry de 23/10 soltos juntos: cada um no seu campo', () => {
    const itens = [item('8012', info('romaneio')), item('8081', info('escala')), item('jac', info('romaneioPao'))]
    const e = montarEnvio(itens, 'nutrimax', false)
    expect(e.podeEnviar).toBe(true)
    expect(e.campos.map(c => [c.campo, c.file.name])).toEqual([['romaneio', '8012.pdf'], ['escala', '8081.pdf'], ['romaneioPao', 'jac.pdf']])
  })
  it('primeiro envio do dia sem o 8012: não envia e diz o que falta', () => {
    const e = montarEnvio([item('8081', info('escala'))], 'nutrimax', false)
    expect(e).toMatchObject({ podeEnviar: false, falta: 'Falta o Romaneio de Entrega (8012) — sem ele o dia não começa.' })
  })
  it('dia já enviado: só a escala esquecida basta', () => {
    expect(montarEnvio([item('8081', info('escala'))], 'nutrimax', true).podeEnviar).toBe(true)
  })
  it('Porto Frio e desconhecido nunca entram no envio', () => {
    const e = montarEnvio([item('pf', info(null, false, 'portofrio')), item('boleto', { ...info(null, false, null), tipo: 'desconhecido' })], 'nutrimax', true)
    expect(e).toMatchObject({ podeEnviar: false, campos: [] })
  })
  it('RQ: só com o Relatório de Entregas', () => {
    expect(montarEnvio([item('rq', info('completo', true, 'rioquality'))], 'rioquality', false).podeEnviar).toBe(true)
    expect(montarEnvio([], 'rioquality', false).podeEnviar).toBe(false)
  })
  it('soltar outro 8012 troca o anterior (vale o último)', () => {
    const r = juntarReconhecidos([item('a', info('romaneio')), item('e', info('escala'))], [item('b', info('romaneio'))])
    expect(r.map(i => i.id)).toEqual(['e', 'b'])
  })
  it('pergunta "de qual cliente é?": respostas', () => {
    expect(respostaArquivoDesconhecido('nutrimax', 'nutrimax')).toMatch(/Romaneio do Pão \(Programação JAC\)/)
    expect(respostaArquivoDesconhecido('rioquality', 'nutrimax')).toBe('Então suba no Ao vivo da Rio Quality. Aqui ele não será enviado.')
    expect(respostaArquivoDesconhecido('portofrio', 'nutrimax')).toMatch(/ainda não entra no Ao vivo/)
  })
})
