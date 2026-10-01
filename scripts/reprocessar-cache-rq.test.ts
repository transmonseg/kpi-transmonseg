import { describe, it, expect, vi } from 'vitest'
import { ehEnderecoRq, proporCorrecoes, montarGravacoes, csvPropostas, rodar, type DepsReprocessar, type LinhaCacheRq } from './reprocessar-cache-rq'

// Relatorio rq-mesmo-lugar-e-sem-rastreador.md (01/10), A2.2: 219 enderecos da
// RQ (30/09) vem de entradas do cache gravadas em 05-07/09, antes de fonte/
// confiavel e da guarda territorial -- nunca validadas e sustentando "NAO FOI".
// Ex.: Estrada do Monteiro (Campo Grande) caiu na zona norte, a 9,4 km.
const MONTEIRO = 'ESTRADA DO MONTEIRO, - CAMPO GRANDE, RIO DE JANEIRO - RJ'
const BARATA = 'R. BARATA RIBEIRO, - COPACABANA, RIO DE JANEIRO - RJ'
const NELSON = 'R. NELSON MANDELA, - BOTAFOGO, RIO DE JANEIRO - RJ'
const linha = (endereco: string, lat: number, lng: number): LinhaCacheRq => ({ endereco, lat, lng, confiavel: true, fonte: null, motivo: null, criado_em: '2026-09-06T10:00:00Z' })

describe('ehEnderecoRq', () => {
  it('formato bruto da RQ (rua sem numero, bairro, cidade, UF) e so ele', () => {
    expect(ehEnderecoRq(MONTEIRO)).toBe(true)
    expect(ehEnderecoRq('RUA X, 120 - CENTRO, ITAPERUNA - RJ')).toBe(false)
    expect(ehEnderecoRq('RUA X')).toBe(false)
  })
})

describe('proporCorrecoes', () => {
  it('nova coordenada longe (>50 m) => atualizar, com distancia; perto => confirmar; null => sem_resultado (nunca apaga)', () => {
    const cands = [linha(MONTEIRO, -22.8628, -43.2415), linha(BARATA, -22.9670, -43.1860), linha(NELSON, -22.95, -43.37)]
    const res = [
      { lat: -22.8960, lng: -43.5520, fonte: 'cnefe', confiavel: true },
      { lat: -22.96702, lng: -43.18601, fonte: 'cnefe', confiavel: true },
      null,
    ]
    const p = proporCorrecoes(cands, res)
    expect(p[0]).toMatchObject({ endereco: MONTEIRO, acao: 'atualizar', latNova: -22.8960, fonteNova: 'cnefe' })
    expect(p[0].distanciaM!).toBeGreaterThan(30_000)
    expect(p[1]).toMatchObject({ acao: 'confirmar' })
    expect(p[2]).toMatchObject({ acao: 'sem_resultado', latNova: null })
  })
  it('guarda territorial reprova (confiavel=false) => atualizar mesmo perto (marca a coordenada como nao confiavel)', () => {
    const p = proporCorrecoes([linha(BARATA, -22.9670, -43.1860)], [{ lat: -22.9670, lng: -43.1860, fonte: 'nominatim', confiavel: false, motivo: 'bairro_divergente' }])
    expect(p[0]).toMatchObject({ acao: 'atualizar', confiavelNova: false, motivoNova: 'bairro_divergente' })
  })
})

describe('montarGravacoes', () => {
  const props = proporCorrecoes([linha(MONTEIRO, -22.8628, -43.2415), linha(BARATA, -22.9670, -43.1860), linha(NELSON, -22.95, -43.37)], [
    { lat: -22.8960, lng: -43.5520, fonte: 'cnefe', confiavel: true },
    { lat: -22.96702, lng: -43.18601, fonte: undefined, confiavel: true },
    null,
  ])
  it('grava atualizar+confirmar; nunca sobrescreve fonte manual/verificacao_manual nem linha que ganhou fonte desde a listagem', () => {
    const atual = new Map([
      [MONTEIRO, linha(MONTEIRO, -22.8628, -43.2415)],
      [BARATA, { ...linha(BARATA, -22.9670, -43.1860), fonte: 'verificacao_manual' }],
      [NELSON, linha(NELSON, -22.95, -43.37)],
    ])
    const { gravar, pulados } = montarGravacoes(props, atual)
    expect(gravar).toEqual([{ endereco: MONTEIRO, lat: -22.8960, lng: -43.5520, fonte: 'cnefe', confiavel: true, motivo: null }])
    expect(pulados).toContainEqual({ endereco: BARATA, motivo: 'fonte_manual' })
    expect(pulados).toContainEqual({ endereco: NELSON, motivo: 'sem_resultado' })
  })
  it('sem fonte na resposta grava fonte "reprocessado" (nunca volta a ficar sem fonte)', () => {
    const { gravar } = montarGravacoes(props, new Map([[BARATA, linha(BARATA, -22.9670, -43.1860)]]))
    expect(gravar).toContainEqual(expect.objectContaining({ endereco: BARATA, fonte: 'reprocessado' }))
  })
})

describe('csvPropostas', () => {
  it('cabecalho + uma linha por proposta, separador ;', () => {
    const csv = csvPropostas(proporCorrecoes([linha(MONTEIRO, -22.8628, -43.2415)], [{ lat: -22.896, lng: -43.552, fonte: 'cnefe', confiavel: true }]))
    const [cab, l1] = csv.trim().split('\n')
    expect(cab).toBe('endereco;lat_antiga;lng_antiga;lat_nova;lng_nova;distancia_m;fonte_nova;confiavel_nova;motivo_nova;acao')
    expect(l1.startsWith(`${MONTEIRO};-22.8628;-43.2415;-22.896;-43.552;`)).toBe(true)
    expect(l1.endsWith(';cnefe;true;;atualizar')).toBe(true)
  })
})

function deps(over: Partial<DepsReprocessar> = {}): DepsReprocessar {
  return {
    listarCandidatos: vi.fn(async () => [linha(MONTEIRO, -22.8628, -43.2415), linha('RUA X, 120 - CENTRO, ITAPERUNA - RJ', -21.2, -41.9)]),
    geocodificar: vi.fn(async (es: string[]) => es.map(() => ({ lat: -22.896, lng: -43.552, fonte: 'cnefe', confiavel: true }))),
    lerAtual: vi.fn(async () => new Map([[MONTEIRO, linha(MONTEIRO, -22.8628, -43.2415)]])),
    gravar: vi.fn(async (ls: unknown[]) => ls.length),
    escrever: vi.fn(),
    ...over,
  }
}

describe('rodar', () => {
  it('sem --aplicar: so enderecos da RQ, re-geocodifica com validarTerritorio, escreve o CSV e NAO grava', async () => {
    const d = deps()
    const r = await rodar({ aplicar: false, dirSaida: '/tmp/x' }, d)
    expect(d.geocodificar).toHaveBeenCalledWith([MONTEIRO])
    expect(d.escrever).toHaveBeenCalledWith('/tmp/x/reprocessar-cache-rq-propostas.csv', expect.stringContaining(MONTEIRO))
    expect(d.gravar).not.toHaveBeenCalled()
    expect(d.lerAtual).not.toHaveBeenCalled()
    expect(r).toMatchObject({ candidatos: 1, propostasAtualizar: 1, gravados: 0 })
  })
  it('filtro opcional pelos enderecos de uma planilha do dia', async () => {
    const d = deps()
    await rodar({ aplicar: false, dirSaida: '/tmp/x', enderecosPlanilha: new Set(['OUTRO']) }, d)
    expect(d.geocodificar).toHaveBeenCalledWith([])
  })
  it('com --aplicar: backup do estado atual ANTES de gravar, depois grava', async () => {
    const ordem: string[] = []
    const d = deps({
      escrever: vi.fn((caminho: string) => { ordem.push(caminho) }),
      gravar: vi.fn(async (ls: unknown[]) => { ordem.push('gravar'); return ls.length }),
    })
    const r = await rodar({ aplicar: true, dirSaida: '/tmp/x' }, d)
    expect(ordem).toEqual(['/tmp/x/reprocessar-cache-rq-propostas.csv', '/tmp/x/reprocessar-cache-rq-backup.csv', 'gravar'])
    expect(r.gravados).toBe(1)
  })
})
