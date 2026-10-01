import { describe, it, expect, vi } from 'vitest'
import { variantesPlaca, proporCvs, varrerCvs, csvPropostasCv, rodar, EMPRESAS_RQ, type DepsDescobrirCv } from './descobrir-cv-rq'
import type { PosicaoPorCv } from '../src/lib/unitrac-api/posicoes'

// Relatorio rq-mesmo-lugar-e-sem-rastreador.md (01/10), PARTE B: LTU7C95 e
// SSW7J12 sairam SEM RASTREADOR por estarem fora da frota -- na Unitrac sao
// CV 19364 (empresa 1169, Carioca Carga) e CV 22272 (1197, FG2). A frota tem
// LTU7C96 (CV 19365), placa vizinha. KZA2F01 nao existe na Unitrac (varredura
// 1-26000, nem trocando O/0).
const pos = (cv: string, placa: string, empresa: string, lat = -22.9, lng = -43.2): PosicaoPorCv => ({ cv, placa, empresa, datagps: '30/09/2026 22:00:00', lat, lng })
const UNITRAC = new Map<string, PosicaoPorCv>([
  ['19364', pos('19364', 'LTU7C95', '1169')],
  ['19365', pos('19365', 'LTU7C96', '1169')],
  ['22272', pos('22272', 'SSW7J12', '1197')],
  ['8154', pos('8154', 'KRP9J46', '819')],
  ['30001', pos('30001', 'ABC1O23', '598')],     // so' casa trocando 0 por O
  ['30002', pos('30002', 'XYZ9A99', '777', -22.81425, -43.34457)], // outra empresa, parado na base da RQ
])

describe('variantesPlaca', () => {
  it('troca O/0 e I/1 (fallback), sem a propria placa', () => {
    expect(variantesPlaca('ABC1023')).toContain('ABC1O23')
    expect(variantesPlaca('KZA2F01')).toEqual(expect.arrayContaining(['KZA2FO1', 'KZA2F0I', 'KZA2FOI']))
    expect(variantesPlaca('KZA2F01')).not.toContain('KZA2F01')
  })
})

describe('proporCvs', () => {
  it('casa por placa exata nas empresas da RQ (598, 1169, 1194, 1197): ok; placa vizinha nunca casa', () => {
    const p = proporCvs(['LTU7C95', 'SSW7J12'], UNITRAC)
    expect(p).toEqual([
      expect.objectContaining({ placa: 'LTU7C95', cv: '19364', empresa: '1169', situacao: 'ok' }),
      expect.objectContaining({ placa: 'SSW7J12', cv: '22272', empresa: '1197', situacao: 'ok' }),
    ])
  })
  it('nao existe na Unitrac: nao_encontrada (KZA2F01)', () => {
    expect(proporCvs(['KZA2F01'], UNITRAC)[0]).toMatchObject({ placa: 'KZA2F01', cv: null, situacao: 'nao_encontrada' })
  })
  it('so casa trocando O/0 ou I/1: conferir', () => {
    expect(proporCvs(['ABC1023'], UNITRAC)[0]).toMatchObject({ cv: '30001', situacao: 'conferir', placaUnitrac: 'ABC1O23' })
  })
  it('placa exata de OUTRA empresa: so propoe (conferir) se a posicao esta a <= 200 m da base da RQ; senao nao casa', () => {
    expect(proporCvs(['XYZ9A99'], UNITRAC)[0]).toMatchObject({ cv: '30002', situacao: 'conferir' })
    expect(proporCvs(['KRP9J46'], UNITRAC)[0]).toMatchObject({ situacao: 'nao_encontrada' })
  })
  it('empresas da RQ', () => {
    expect([...EMPRESAS_RQ].sort()).toEqual(['1169', '1194', '1197', '598'])
  })
})

describe('varrerCvs', () => {
  it('varre 1..max em lotes de 500 (52 chamadas cobrem 1-26000) e junta tudo', async () => {
    const buscar = vi.fn(async (cvs: string[]) => new Map(cvs.filter(c => UNITRAC.has(c)).map(c => [c, UNITRAC.get(c)!])))
    const m = await varrerCvs(buscar, 26_000)
    expect(buscar).toHaveBeenCalledTimes(52)
    expect(buscar.mock.calls[0][0]).toHaveLength(500)
    expect(m.get('22272')?.placa).toBe('SSW7J12')
  })
  it('lote que falha tenta de novo 1 vez; falhou de novo => lanca (descoberta para)', async () => {
    let n = 0
    const buscar = vi.fn(async () => { n++; if (n === 1) throw new Error('timeout'); return new Map<string, PosicaoPorCv>() })
    await varrerCvs(buscar, 500)
    expect(buscar).toHaveBeenCalledTimes(2)
    await expect(varrerCvs(async () => { throw new Error('x') }, 500)).rejects.toThrow()
  })
})

describe('csvPropostasCv', () => {
  it('cabecalho + linhas', () => {
    const csv = csvPropostasCv(proporCvs(['LTU7C95'], UNITRAC))
    expect(csv.split('\n')[0]).toBe('placa;cv;placa_unitrac;empresa;datagps;situacao;motivo')
    expect(csv.split('\n')[1].startsWith('LTU7C95;19364;LTU7C95;1169;')).toBe(true)
  })
})

function deps(over: Partial<DepsDescobrirCv> = {}): DepsDescobrirCv {
  return {
    lerFrota: vi.fn(async () => new Map([['LTU7C96', '19365']])),
    buscarPosicoes: vi.fn(async (cvs: string[]) => new Map(cvs.filter(c => UNITRAC.has(c)).map(c => [c, UNITRAC.get(c)!]))),
    inserir: vi.fn(async (ls: unknown[]) => ls.length),
    escrever: vi.fn(),
    ...over,
  }
}

describe('rodar', () => {
  const PLACAS = new Set(['LTU7C95', 'SSW7J12', 'KZA2F01', 'LTU7C96'])
  it('so placas da planilha fora da frota; sem --aplicar escreve CSV e nao insere', async () => {
    const d = deps()
    const r = await rodar({ placas: PLACAS, aplicar: false, dirSaida: '/tmp/x', maxCv: 30_500 }, d)
    expect(r).toMatchObject({ semCv: 3, ok: 2, conferir: 0, naoEncontradas: 1, inseridos: 0 })
    expect(d.escrever).toHaveBeenCalledWith('/tmp/x/descobrir-cv-rq-propostas.csv', expect.stringContaining('SSW7J12;22272'))
    expect(d.inserir).not.toHaveBeenCalled()
  })
  it('tudo ja na frota: nem varre a Unitrac', async () => {
    const d = deps()
    await rodar({ placas: new Set(['LTU7C96']), aplicar: true, dirSaida: '/tmp/x' }, d)
    expect(d.buscarPosicoes).not.toHaveBeenCalled()
    expect(d.inserir).not.toHaveBeenCalled()
  })
  it('com --aplicar insere so as "ok" (conferir fica pra pessoa)', async () => {
    const d = deps()
    const r = await rodar({ placas: new Set(['LTU7C95', 'ABC1023']), aplicar: true, dirSaida: '/tmp/x', maxCv: 30_500 }, d)
    expect(d.inserir).toHaveBeenCalledWith([{ placa_norm: 'LTU7C95', cv: '19364', nome: null }])
    expect(r.inseridos).toBe(1)
  })
})
