import { describe, it, expect, vi, afterAll } from 'vitest'
import ExcelJS from 'exceljs'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import type { ResolucaoNfRow } from '@/lib/kpi-romaneio/resolucoes'

// F3-03 (KRQ-10): o pipeline da RQ ignorava kpi_nf_resolucao -- a RQ tem de
// 184 a 276 "revisar" por dia e nenhuma saída. Agora aplica a resolução
// vigente (mesma aplicarResolucoes da Nutry): a automática fica igual e a
// "TAXA APÓS CONFERÊNCIA" muda. Caso real: TTU9G22 em 23/10.
vi.useFakeTimers({ toFake: ['Date'] })
vi.setSystemTime(new Date('2026-10-24T10:00:00-03:00'))
afterAll(() => { vi.useRealTimers() })

vi.mock('./geocode-coerencia', () => ({ geocodificarPorCoerencia: vi.fn(async () => new Map()) }))
vi.mock('@/lib/kpi-romaneio/geocode', () => ({
  geocodificarEnderecosComInfo: vi.fn(async (enderecos: string[]) => ({
    resultados: enderecos.map(e => e.startsWith('RUA RODRIGUES ALVES')
      ? { lat: -22.314978, lng: -42.332158, confiavel: true, fonte: 'cnefe' }
      : { lat: -22.3842593, lng: -42.4815298, confiavel: true, fonte: 'photon' }),
    parciais: 0,
  })),
}))
vi.mock('@/lib/kpi-romaneio/geocode-ancoras', () => ({ reposicionarPorAncoras: vi.fn(async () => new Map()) }))
vi.mock('./enviar-monitoramento-rq', () => ({ buscarCoordenadasMonitoramentoRQ: vi.fn(async () => new Map()) }))
vi.mock('./cache-corredor', () => ({ lerCorredorDoCache: vi.fn(async () => new Map()), gravarCorredorNoCache: vi.fn(async () => 0) }))

import { gerarKpiRioQuality } from './pipeline'

const p = (id: string, chegada: string, fim: string, lat: number, lng: number, classificacao = 'FORA_BASE'): UnitracParadaRow => ({
  id: `TTU9G22-${id}`, placa_norm: 'TTU9G22', chegada: `2026-10-23T${chegada}.000Z`, saida: `2026-10-23T${fim}.000Z`, fim_real: `2026-10-23T${fim}.000Z`,
  duracao_seg: 0, local_parada: '', codigo_loja: null, nome_loja: null, lat, lng, classificacao, ordem: 0,
})
const PARADAS: UnitracParadaRow[] = [
  p('api-1', '06:21:40', '06:24:40', -22.81593, -43.342, 'BASE'),
  p('api-13', '12:48:52', '13:17:09', -22.314925, -42.3321549),
  p('api-22', '17:38:07', '23:53:07', -22.8143116, -43.3439166, 'BASE'),
]
const entrega = (nf: string, rua: string, bairro: string, clienteNome: string) => ({
  placaNorm: 'TTU9G22', clienteNome, cidade: 'NOVA FRIBURGO', uf: 'RJ', destino: 'SERRA', motorista: 'M', rua, bairro, nf, clienteCodigo: nf, romaneio: '9001', rota: 'SERRA',
})
const ENTREGAS = [
  entrega('5558903', 'RUA RODRIGUES ALVES', 'SAO PEDRO DA SERRA', 'ANTONIO ROGERIO FERREIRA DA SILVA'),
  entrega('5558931', 'ESTRADA MURY MACAE DE CIMA', 'QUINTO DISTRITO', 'GRILICO COMERCIAL DE FRIBURGO LTDA'),
]
const resolucao = (nf: string, r: ResolucaoNfRow['resolucao']): ResolucaoNfRow => ({
  id: 1, empresa: 'RIO QUALITY', data: '2026-10-23', nf, resolucao: r, placa_executora: null, observacao: null,
  responsavel: 'erica@transmonseg.com.br', documento: 'comprovantes/rioquality/2026-10-23/x.jpg', criado_em: '2026-10-24T12:00:00Z',
})

async function gerar(buscarResolucoes: (empresa: string, data: string) => Promise<ResolucaoNfRow[]>) {
  return gerarKpiRioQuality({
    entregasCompletas: ENTREGAS, data: '2026-10-23', hoje: '2026-10-24', cvPorPlaca: new Map([['TTU9G22', '9']]),
    buscarParadas: async () => PARADAS,
    medirRastro: async () => ({ km: 320, pontosNoDia: 1400 }),
    buscarUltimaComunicacao: async () => new Map(),
    buscarResolucoes,
  })
}

async function linhaDaTaxa(xlsx: Buffer): Promise<string> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(xlsx as unknown as ArrayBuffer)
  let achada = ''
  wb.worksheets[0].eachRow(r => r.eachCell(c => { const v = String(c.value ?? ''); if (v.includes('APÓS CONFERÊNCIA')) achada = v }))
  return achada
}

describe('F3-03: pipeline da RQ aplica as resoluções da operação', () => {
  it('lê pela chave da RQ, marca a NF e muda só a taxa após conferência', async () => {
    const pedidas: [string, string][] = []
    const sem = await gerar(async (e, d) => { pedidas.push([e, d]); return [] })
    const com = await gerar(async () => [resolucao('5558931', 'entregue')])
    expect(pedidas).toEqual([['RIO QUALITY', '2026-10-23']])
    const nf = com.detalhe.find(d => d.nf === '5558931')!
    expect(nf.status).toBe('pendente') // automática preservada
    expect(nf.resolucaoManual).toBe('entregue')
    expect(nf.responsavelResolucao).toBe('erica@transmonseg.com.br')
    expect(sem.detalhe.find(d => d.nf === '5558931')!.resolucaoManual).toBeUndefined()
    expect(await linhaDaTaxa(sem.xlsx)).toContain('TAXA APÓS CONFERÊNCIA DA OPERAÇÃO: 50,0% (1 de 2 NFs')
    expect(await linhaDaTaxa(com.xlsx)).toContain('TAXA APÓS CONFERÊNCIA DA OPERAÇÃO: 100,0% (2 de 2 NFs')
    // Taxa oficial igual nas duas.
    const oficial = (s: string) => s.split('|')[0]
    expect(oficial(await linhaDaTaxa(com.xlsx))).toBe(oficial(await linhaDaTaxa(sem.xlsx)))
  })

  it('regerar o dia não apaga a resolução (a tabela só é lida; a segunda geração aplica de novo)', async () => {
    const tabela = [resolucao('5558931', 'nao_esteve_no_local')]
    const ler = vi.fn(async () => tabela)
    const a = await gerar(ler)
    const b = await gerar(ler)
    expect(tabela).toHaveLength(1)
    expect(a.detalhe.find(d => d.nf === '5558931')!.resolucaoManual).toBe('nao_esteve_no_local')
    expect(b.detalhe.find(d => d.nf === '5558931')!.resolucaoManual).toBe('nao_esteve_no_local')
  })

  it('tabela indisponível não derruba a geração: aviso de fonte e mesmo resultado', async () => {
    const r = await gerar(async () => { throw new Error('relation "kpi_nf_resolucao" does not exist') })
    expect(r.avisos).toContainEqual(expect.objectContaining({ motivo: 'fonte_indisponivel', fonte: 'resolucoes' }))
    expect(r.detalhe.every(d => d.resolucaoManual == null)).toBe(true)
  })
})
