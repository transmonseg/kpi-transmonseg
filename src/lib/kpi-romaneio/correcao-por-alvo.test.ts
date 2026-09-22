import { describe, it, expect } from 'vitest'
import { instanteDeFeitoISO, sugerirCorrecoesPorAlvo, type EntregaParaCorrigir } from './correcao-por-alvo'
import type { AlvoApi } from '@/lib/unitrac-api'
import type { ParadaBridge } from './base-horarios'

const alvo = (o: Partial<AlvoApi>): AlvoApi => ({
  placaNorm: 'AAA1A11', codigoUnitrac: '136118', nome: 'LOJA', situacao: 1,
  feitoISO: '2026-09-21T08:35:00', documento: '100', inicioISO: '2026-09-21T06:00:00',
  ordem: 1, rota: 'R1', pontoLat: null, pontoLng: null, ...o,
})
// chegada/saida com fuso REAL (+02:00, como a ponte devolve): 12:31+02 = 07:31 BRT
const parada = (o: Partial<ParadaBridge>): ParadaBridge => ({
  chegada: '2026-09-21T13:31:00+02:00', saida: '2026-09-21T13:36:00+02:00', duracaoSeg: 300,
  lat: -21.8434, lng: -41.4300, classificacao: 'FORA_BASE', ...o,
})
const entrega = (o: Partial<EntregaParaCorrigir>): EntregaParaCorrigir => ({
  nf: '100', placaNorm: 'AAA1A11', endereco: 'EST DORES DE MACABU, 286 - DORES DE MACABU, CAMPOS DOS GOYT',
  latAtual: -21.88, lngAtual: -41.46, confiavelAtual: false, ...o,
})

describe('instanteDeFeitoISO', () => {
  it('trata os digitos como horario de Brasilia (-03:00)', () => {
    expect(instanteDeFeitoISO('2026-09-21T08:35:00')).toBe(Date.parse('2026-09-21T11:35:00Z'))
  })
  it('ignora um Z mentiroso no fim (digitos continuam BRT)', () => {
    expect(instanteDeFeitoISO('2026-09-21T08:35:00Z')).toBe(Date.parse('2026-09-21T11:35:00Z'))
  })
})

describe('sugerirCorrecoesPorAlvo', () => {
  const paradas = new Map([['AAA1A11', [parada({})]]])

  it('feitoISO dentro da janela da parada (fusos diferentes) -> sugere a coordenada da PARADA', () => {
    const r = sugerirCorrecoesPorAlvo([entrega({})], [alvo({})], paradas)
    expect(r.rejeicoes).toEqual([])
    expect(r.sugestoes).toHaveLength(1)
    expect(r.sugestoes[0]).toMatchObject({ latNova: -21.8434, lngNova: -41.4300, nfs: ['100'], codigoUnitrac: '136118' })
    expect(r.sugestoes[0].distAtualM).toBeGreaterThan(800)
  })

  it('sem o ajuste de fuso a parada NAO casaria -- feito 08:35 BRT e parada 08:31-08:36 BRT', () => {
    const r = sugerirCorrecoesPorAlvo([entrega({})], [alvo({ feitoISO: '2026-09-21T13:33:00' })], paradas)
    expect(r.sugestoes).toEqual([])
    expect(r.rejeicoes[0].motivo).toBe('feito_fora_de_parada')
  })

  it('usa a parada, nunca o ponto cadastrado da Unitrac, mas reporta a distancia do cadastro', () => {
    const r = sugerirCorrecoesPorAlvo([entrega({})], [alvo({ pontoLat: -21.70, pontoLng: -41.30 })], paradas)
    expect(r.sugestoes[0].latNova).toBe(-21.8434)
    expect(r.sugestoes[0].cadastroLat).toBe(-21.70)
    expect(r.sugestoes[0].distCadastroM).toBeGreaterThan(500)
  })

  it('alvo nao feito, sem documento ou NF sem alvo -> sem_alvo_feito, sem excecao', () => {
    const r = sugerirCorrecoesPorAlvo(
      [entrega({}), entrega({ nf: '200' }), entrega({ nf: '300' })],
      [alvo({ situacao: 0, feitoISO: null }), alvo({ documento: null }), alvo({ documento: '300', feitoISO: null })],
      paradas,
    )
    expect(r.sugestoes).toEqual([])
    expect(r.rejeicoes.map(x => x.motivo)).toEqual(['sem_alvo_feito', 'sem_alvo_feito', 'sem_alvo_feito'])
  })

  it('placa sem nenhuma parada na ponte -> feito_fora_de_parada', () => {
    const r = sugerirCorrecoesPorAlvo([entrega({})], [alvo({})], new Map())
    expect(r.rejeicoes[0].motivo).toBe('feito_fora_de_parada')
  })

  it('parada BASE nao conta', () => {
    const r = sugerirCorrecoesPorAlvo([entrega({})], [alvo({})], new Map([['AAA1A11', [parada({ classificacao: 'BASE' })]]]))
    expect(r.rejeicoes[0].motivo).toBe('feito_fora_de_parada')
  })

  it('parada acima de 120 min -> parada_longa', () => {
    const longa = parada({ chegada: '2026-09-21T11:00:00+02:00', saida: '2026-09-21T15:00:00+02:00', duracaoSeg: 4 * 3600 })
    const r = sugerirCorrecoesPorAlvo([entrega({})], [alvo({})], new Map([['AAA1A11', [longa]]]))
    expect(r.rejeicoes[0].motivo).toBe('parada_longa')
  })

  it('endereco de ilha -> ilha', () => {
    const r = sugerirCorrecoesPorAlvo([entrega({ endereco: 'PR DO ABRAAO, 687 - ABRAAO, ANGRA DOS REIS - ILHA GRANDE' })], [alvo({})], paradas)
    expect(r.rejeicoes[0].motivo).toBe('ilha')
  })

  it('coordenada atual confiavel a <=800m da parada -> coordenada_atual_ok', () => {
    const r = sugerirCorrecoesPorAlvo([entrega({ latAtual: -21.8440, lngAtual: -41.4305, confiavelAtual: true })], [alvo({})], paradas)
    expect(r.rejeicoes[0].motivo).toBe('coordenada_atual_ok')
  })

  it('coordenada atual NAO confiavel perto da parada -> ainda corrige (vira confiavel)', () => {
    const r = sugerirCorrecoesPorAlvo([entrega({ latAtual: -21.8440, lngAtual: -41.4305, confiavelAtual: false })], [alvo({})], paradas)
    expect(r.sugestoes).toHaveLength(1)
  })

  it('3 NFs do mesmo endereco na mesma parada -> UMA sugestao com as 3 NFs', () => {
    const r = sugerirCorrecoesPorAlvo(
      [entrega({ nf: '1' }), entrega({ nf: '2' }), entrega({ nf: '3' })],
      [alvo({ documento: '1' }), alvo({ documento: '2' }), alvo({ documento: '3' })],
      paradas,
    )
    expect(r.sugestoes).toHaveLength(1)
    expect(r.sugestoes[0].nfs).toEqual(['1', '2', '3'])
  })

  it('mesmo endereco casado com duas paradas a mais de 300m -> paradas_conflitantes, sem sugestao', () => {
    const p2 = parada({ chegada: '2026-09-21T15:00:00+02:00', saida: '2026-09-21T15:10:00+02:00', lat: -21.90, lng: -41.50 })
    const r = sugerirCorrecoesPorAlvo(
      [entrega({ nf: '1' }), entrega({ nf: '2' })],
      [alvo({ documento: '1' }), alvo({ documento: '2', feitoISO: '2026-09-21T10:05:00' })],
      new Map([['AAA1A11', [parada({}), p2]]]),
    )
    expect(r.sugestoes).toEqual([])
    expect(r.rejeicoes.map(x => x.motivo)).toEqual(['paradas_conflitantes', 'paradas_conflitantes'])
  })

  it('mesmo endereco em leque: 0m, +250m, -250m (par a par so a extrema bate >300m) -> paradas_conflitantes nas 3', () => {
    const p1 = parada({})
    const p2 = parada({ chegada: '2026-09-21T14:00:00+02:00', saida: '2026-09-21T14:05:00+02:00', duracaoSeg: 300, lat: -21.8434 + 0.00225 })
    const p3 = parada({ chegada: '2026-09-21T15:00:00+02:00', saida: '2026-09-21T15:05:00+02:00', duracaoSeg: 300, lat: -21.8434 - 0.00225 })
    const r = sugerirCorrecoesPorAlvo(
      [entrega({ nf: '1' }), entrega({ nf: '2' }), entrega({ nf: '3' })],
      [alvo({ documento: '1' }), alvo({ documento: '2', feitoISO: '2026-09-21T09:02:00' }), alvo({ documento: '3', feitoISO: '2026-09-21T10:02:00' })],
      new Map([['AAA1A11', [p1, p2, p3]]]),
    )
    expect(r.sugestoes).toEqual([])
    expect(r.rejeicoes.map(x => x.motivo)).toEqual(['paradas_conflitantes', 'paradas_conflitantes', 'paradas_conflitantes'])
  })

  it('mesma parada respondendo por dois enderecos distintos (baixa em lote) -> parada_compartilhada pros dois, sem sugestao', () => {
    const r = sugerirCorrecoesPorAlvo(
      [entrega({ nf: '1' }), entrega({ nf: '2', endereco: 'OUTRO ENDERECO, 10 - BAIRRO X, CIDADE Y' })],
      [alvo({ documento: '1' }), alvo({ documento: '2' })],
      paradas,
    )
    expect(r.sugestoes).toEqual([])
    expect(r.rejeicoes.map(x => x.motivo)).toEqual(['parada_compartilhada', 'parada_compartilhada'])
  })

  it('dois alvos feito=1 pra mesma placa|documento com feitoISO diferentes -> alvo_duplicado', () => {
    const r = sugerirCorrecoesPorAlvo(
      [entrega({})],
      [alvo({}), alvo({ feitoISO: '2026-09-21T09:00:00' })],
      paradas,
    )
    expect(r.sugestoes).toEqual([])
    expect(r.rejeicoes[0].motivo).toBe('alvo_duplicado')
  })

  it('parada de exatamente 120 min e feitoISO igual a chegada -> aceito (limites inclusivos)', () => {
    const p = parada({ chegada: '2026-09-21T13:00:00+02:00', saida: '2026-09-21T15:00:00+02:00', duracaoSeg: 120 * 60 })
    const r = sugerirCorrecoesPorAlvo([entrega({})], [alvo({ feitoISO: '2026-09-21T08:00:00' })], new Map([['AAA1A11', [p]]]))
    expect(r.rejeicoes).toEqual([])
    expect(r.sugestoes).toHaveLength(1)
  })

  it('feitoISO igual a saida -> aceito', () => {
    const p = parada({ chegada: '2026-09-21T13:00:00+02:00', saida: '2026-09-21T15:00:00+02:00', duracaoSeg: 120 * 60 })
    const r = sugerirCorrecoesPorAlvo([entrega({})], [alvo({ feitoISO: '2026-09-21T10:00:00' })], new Map([['AAA1A11', [p]]]))
    expect(r.rejeicoes).toEqual([])
    expect(r.sugestoes).toHaveLength(1)
  })
})
