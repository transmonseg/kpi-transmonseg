import { describe, it, expect, vi } from 'vitest'
import { variantesPlaca, proporCvs, varrerCvs, csvPropostasCv, rodar, EMPRESAS_RQ, placasDoRomaneioRq, lerArgs, enviarFrotaMonitoramento, dirSaidaPadrao, type DepsDescobrirCv } from './descobrir-cv-rq'
import { tmpdir } from 'os'
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

// F2-15 (MON-12): a varredura vira cron. Sem planilha: placas do relatorio da
// RQ guardado no Ao vivo dos ultimos N dias; aplica so' as "ok" e manda a
// frota inteira ao monitoramento (copia de 06/10 parada). Caso real: placas
// fora da frota com carga de 14 a 23/10 = KZA2F01 (147 NFs), XXX5678 (108,
// placa de preenchimento, 15/10), TUP0B49 (104) e TUB7J93 (76).
describe('placasDoRomaneioRq', () => {
  it('placas dos dias guardados, sem a de preenchimento (XXX) e sem vazia', () => {
    const dias = [
      [{ placaNorm: 'KZA2F01' }, { placaNorm: 'TUP0B49' }, { placaNorm: '' }],
      [{ placaNorm: 'XXX5678' }, { placaNorm: 'TUB7J93' }, { placaNorm: 'LTU7C96' }, {}],
    ]
    expect([...placasDoRomaneioRq(dias)].sort()).toEqual(['KZA2F01', 'LTU7C96', 'TUB7J93', 'TUP0B49'])
  })
})

describe('lerArgs', () => {
  it('planilha (uso antigo) ou --dias N (cron), --aplicar e --saida', () => {
    expect(lerArgs(['x.xlsx'])).toEqual({ planilha: 'x.xlsx', dias: null, aplicar: false, saida: null })
    expect(lerArgs(['--dias', '3', '--aplicar', '--saida', '/var/log'])).toEqual({ planilha: null, dias: 3, aplicar: true, saida: '/var/log' })
    expect(() => lerArgs([])).toThrow(/Uso/)
    expect(() => lerArgs(['--dias', 'abc'])).toThrow(/Uso/)
  })
})

describe('rodar: frota mandada ao monitoramento (F2-15)', () => {
  it('com --aplicar manda a frota relida depois da insercao, mesmo sem placa nova', async () => {
    const enviar = vi.fn(async () => 'ok')
    const d = deps({ enviarMonitoramento: enviar })
    await rodar({ placas: new Set(['LTU7C96']), aplicar: true, dirSaida: '/tmp/x' }, d)
    expect(enviar).toHaveBeenCalledTimes(1)
    expect(enviar.mock.calls[0][0]).toBeInstanceOf(Map)
    const enviar2 = vi.fn(async () => 'ok')
    const d2 = deps({ enviarMonitoramento: enviar2 })
    await rodar({ placas: new Set(['LTU7C95']), aplicar: true, dirSaida: '/tmp/x', maxCv: 30_500 }, d2)
    expect(d2.lerFrota).toHaveBeenCalledTimes(2) // relida depois de inserir
    expect(enviar2).toHaveBeenCalledTimes(1)
  })
  it('sem --aplicar nunca manda nada ao monitoramento', async () => {
    const enviar = vi.fn(async () => 'ok')
    await rodar({ placas: new Set(['LTU7C95']), aplicar: false, dirSaida: '/tmp/x', maxCv: 30_500 }, deps({ enviarMonitoramento: enviar }))
    expect(enviar).not.toHaveBeenCalled()
  })
})

describe('enviarFrotaMonitoramento', () => {
  const frota = new Map([['LTU7C95', '19364'], ['TUP0B49', '24410']])
  it('manda {placa, cv} com a chave do motor e resume a resposta', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ ok: true, inseridos: ['TUP-0B49'], jaExistiam: 1, conflitos: [] }), { status: 200 }))
    const r = await enviarFrotaMonitoramento(frota, { base: 'http://mon', chave: 'k', fetch: f as unknown as typeof fetch })
    expect(r).toMatch(/1 inserido.*TUP-0B49.*1 já existia/)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://mon/api/veiculos/rioquality')
    expect((init.headers as Record<string, string>)['x-motor-key']).toBe('k')
    expect(JSON.parse(init.body as string)).toEqual({ veiculos: [{ placa: 'LTU7C95', cv: '19364' }, { placa: 'TUP0B49', cv: '24410' }] })
  })
  it('monitoramento antigo (404) ou fora do ar: só avisa, nunca lança', async () => {
    const f404 = vi.fn(async () => new Response('not found', { status: 404 }))
    expect(await enviarFrotaMonitoramento(frota, { base: 'http://mon', chave: 'k', fetch: f404 as unknown as typeof fetch })).toMatch(/sem a rota/)
    const fErro = vi.fn(async () => { throw new TypeError('fetch failed') })
    expect(await enviarFrotaMonitoramento(frota, { base: 'http://mon', chave: 'k', fetch: fErro as unknown as typeof fetch })).toMatch(/fetch failed/)
  })
})

// F2-REV-10 (revisao independente da Fase 2): (1) --dias sem --saida gravava o
// CSV no cwd (/srv/kpi-transmonseg no cron); (2) a varredura de ate' 26 mil
// cvs rodava a cada execucao enquanto sobrasse placa sem cv -- KZA2F01 (sem
// rastreador de verdade, nao_encontrada na varredura de 24/10) faria 52
// chamadas a' Unitrac em todo cron (06:40 e 13:40).
describe('F2-REV-10: saída fora do cwd e varredura no máximo 1x por dia', () => {
  it('--dias sem --saida grava no diretório temporário; --saida e planilha mantêm o comportamento', () => {
    expect(dirSaidaPadrao(lerArgs(['--dias', '3', '--aplicar']))).toBe(tmpdir())
    expect(dirSaidaPadrao(lerArgs(['--dias', '3', '--saida', '/var/log']))).toBe('/var/log')
    expect(dirSaidaPadrao(lerArgs(['x.xlsx']))).toBe(process.cwd())
  })
  const marcaDeps = (marca: { data: string; placas: string[] } | null) => {
    const gravada: { data: string; placas: string[] }[] = []
    return { gravada, extra: { lerMarca: () => marca, gravarMarca: (m: { data: string; placas: string[] }) => { gravada.push(m) } } }
  }
  it('KZA2F01 já varrida hoje e nada novo: não varre de novo (frota ainda vai ao monitoramento)', async () => {
    const enviar = vi.fn(async () => 'ok')
    const m = marcaDeps({ data: '2026-10-24', placas: ['KZA2F01'] })
    const d = deps({ enviarMonitoramento: enviar, ...m.extra })
    const r = await rodar({ placas: new Set(['KZA2F01', 'LTU7C96']), aplicar: true, dirSaida: '/tmp/x', hoje: '2026-10-24' }, d)
    expect(d.buscarPosicoes).not.toHaveBeenCalled()
    expect(r.semCv).toBe(1)
    expect(enviar).toHaveBeenCalledTimes(1)
    expect(m.gravada).toEqual([])
  })
  it('placa nova desde a última varredura ou outro dia: varre e grava a marca', async () => {
    const m = marcaDeps({ data: '2026-10-24', placas: ['KZA2F01'] })
    const d = deps(m.extra)
    await rodar({ placas: new Set(['KZA2F01', 'LTU7C95']), aplicar: true, dirSaida: '/tmp/x', maxCv: 30_500, hoje: '2026-10-24' }, d)
    expect(d.buscarPosicoes).toHaveBeenCalled()
    expect(m.gravada).toEqual([{ data: '2026-10-24', placas: ['KZA2F01', 'LTU7C95'] }])
    const m2 = marcaDeps({ data: '2026-10-23', placas: ['KZA2F01'] })
    const d2 = deps(m2.extra)
    await rodar({ placas: new Set(['KZA2F01']), aplicar: true, dirSaida: '/tmp/x', maxCv: 30_500, hoje: '2026-10-24' }, d2)
    expect(d2.buscarPosicoes).toHaveBeenCalled()
    expect(m2.gravada).toEqual([{ data: '2026-10-24', placas: ['KZA2F01'] }])
  })
  it('rodada a seco (sem --aplicar) sempre varre e não grava a marca (não segura o cron que insere)', async () => {
    const m = marcaDeps({ data: '2026-10-24', placas: ['KZA2F01'] })
    const d = deps(m.extra)
    await rodar({ placas: new Set(['KZA2F01']), aplicar: false, dirSaida: '/tmp/x', maxCv: 30_500, hoje: '2026-10-24' }, d)
    expect(d.buscarPosicoes).toHaveBeenCalled()
    expect(m.gravada).toEqual([])
  })
})
