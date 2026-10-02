import { describe, it, expect } from 'vitest'
import { detectarDescasamentos, detectarMotoristaMultiplasPlacas, detectarCargaMultiRegiao } from './avisos'
import type { LinhaEscala, LinhaGeocodificada } from './types'

function escala(overrides: Partial<LinhaEscala> = {}): LinhaEscala {
  return {
    carga: '93758',
    placaRaw: 'TTL7D40',
    placaNorm: 'TTL7D40',
    destino: 'CAMPOS',
    motorista: 'MOTORISTA TESTE',
    ajudante1: null,
    ajudante2: null,
    pesoKg: null,
    entPlanejado: null,
    nfPlanejado: null,
    ...overrides,
  }
}

describe('detectarDescasamentos', () => {
  it('sem nenhum descasamento -- lista vazia', () => {
    const escalas = [escala({ carga: '111', placaNorm: 'AAA1111' })]
    const romaneio = [{ carga: '111', placaNorm: 'AAA1111' }]
    expect(detectarDescasamentos(escalas, romaneio)).toEqual([])
  })

  it('carga da Escala sem correspondencia no Romaneio -- motivo sem_romaneio', () => {
    const escalas = [escala({ carga: '111', placaNorm: 'AAA1111' })]
    const romaneio: { carga: string; placaNorm: string }[] = []
    expect(detectarDescasamentos(escalas, romaneio)).toEqual([
      { carga: '111', placa: 'AAA1111', motivo: 'sem_romaneio' },
    ])
  })

  it('carga do Romaneio sem correspondencia na Escala -- motivo sem_escala', () => {
    const escalas: LinhaEscala[] = []
    const romaneio = [{ carga: '222', placaNorm: 'BBB2222' }]
    expect(detectarDescasamentos(escalas, romaneio)).toEqual([
      { carga: '222', placa: 'BBB2222', motivo: 'sem_escala' },
    ])
  })

  it('descasamento nas duas direcoes ao mesmo tempo', () => {
    const escalas = [
      escala({ carga: '111', placaNorm: 'AAA1111' }), // bate com o romaneio
      escala({ carga: '333', placaNorm: 'CCC3333' }), // so' na escala
    ]
    const romaneio = [
      { carga: '111', placaNorm: 'AAA1111' }, // bate com a escala
      { carga: '222', placaNorm: 'BBB2222' }, // so' no romaneio
    ]
    const r = detectarDescasamentos(escalas, romaneio)
    expect(r).toHaveLength(2)
    expect(r).toContainEqual({ carga: '222', placa: 'BBB2222', motivo: 'sem_escala' })
    expect(r).toContainEqual({ carga: '333', placa: 'CCC3333', motivo: 'sem_romaneio' })
  })

  it('mesma carga, placas diferentes -- nao casa (chave e carga+placa)', () => {
    const escalas = [escala({ carga: '111', placaNorm: 'AAA1111' })]
    const romaneio = [{ carga: '111', placaNorm: 'ZZZ9999' }]
    const r = detectarDescasamentos(escalas, romaneio)
    expect(r).toContainEqual({ carga: '111', placa: 'AAA1111', motivo: 'sem_romaneio' })
    expect(r).toContainEqual({ carga: '111', placa: 'ZZZ9999', motivo: 'sem_escala' })
  })

  // Task 2 (plano 2026-09-30, item 2 -- RQS7H76 29/09: Escala 34 x Romaneio 32):
  // NF PLANEJADO vem da Escala e o detalhe/taxa do Romaneio; a divergencia de
  // quantidade tem que virar aviso visivel (sem mexer em taxa/denominador).
  it('mesma carga+placa com NFs da Escala != NFs do Romaneio -- motivo nf_divergente com as duas contagens', () => {
    const escalas = [escala({ carga: '98969', placaNorm: 'RQS7H76', nfPlanejado: 34 })]
    const romaneio = [{ carga: '98969', placaNorm: 'RQS7H76', nfsRomaneio: 32 }]
    expect(detectarDescasamentos(escalas, romaneio)).toEqual([
      { carga: '98969', placa: 'RQS7H76', motivo: 'nf_divergente', nfEscala: 34, nfRomaneio: 32 },
    ])
  })

  it('contagens iguais, nfPlanejado nulo ou nfsRomaneio ausente -- sem aviso de NF', () => {
    const escalas = [
      escala({ carga: '1', placaNorm: 'AAA1111', nfPlanejado: 10 }),
      escala({ carga: '2', placaNorm: 'BBB2222', nfPlanejado: null }),
      escala({ carga: '3', placaNorm: 'CCC3333', nfPlanejado: 5 }),
    ]
    const romaneio = [
      { carga: '1', placaNorm: 'AAA1111', nfsRomaneio: 10 },
      { carga: '2', placaNorm: 'BBB2222', nfsRomaneio: 7 },
      { carga: '3', placaNorm: 'CCC3333' },
    ]
    expect(detectarDescasamentos(escalas, romaneio)).toEqual([])
  })
})

describe('detectarMotoristaMultiplasPlacas', () => {
  it('motorista em uma só placa -- sem aviso', () => {
    const escalas = [
      escala({ carga: '1', placaNorm: 'AAA1111', motorista: 'JOAO' }),
      escala({ carga: '2', placaNorm: 'BBB2222', motorista: 'MARIA' }),
    ]
    expect(detectarMotoristaMultiplasPlacas(escalas)).toEqual([])
  })

  it('motorista aparece em 2 placas diferentes no mesmo dia -- aviso com as placas', () => {
    const escalas = [
      escala({ carga: '98593', placaNorm: 'TUO1D10', motorista: 'CARLOS SILVA' }),
      escala({ carga: '98700', placaNorm: 'RBJ2J67', motorista: 'CARLOS SILVA' }),
    ]
    const r = detectarMotoristaMultiplasPlacas(escalas)
    expect(r).toHaveLength(1)
    expect(r[0].motivo).toBe('motorista_multiplas_placas')
    expect(r[0].motorista).toBe('CARLOS SILVA')
    expect(r[0].placas).toEqual(['RBJ2J67', 'TUO1D10'])
  })

  it('motorista em 3+ placas -- todas listadas', () => {
    const escalas = [
      escala({ carga: '1', placaNorm: 'AAA1111', motorista: 'PEDRO' }),
      escala({ carga: '2', placaNorm: 'BBB2222', motorista: 'PEDRO' }),
      escala({ carga: '3', placaNorm: 'CCC3333', motorista: 'PEDRO' }),
    ]
    const r = detectarMotoristaMultiplasPlacas(escalas)
    expect(r).toHaveLength(1)
    expect(r[0].placas).toEqual(['AAA1111', 'BBB2222', 'CCC3333'])
  })

  it('mesmo motorista na MESMA placa (cargas diferentes) -- sem aviso', () => {
    const escalas = [
      escala({ carga: '1', placaNorm: 'AAA1111', motorista: 'JOAO' }),
      escala({ carga: '2', placaNorm: 'AAA1111', motorista: 'JOAO' }),
    ]
    expect(detectarMotoristaMultiplasPlacas(escalas)).toEqual([])
  })

  it('normaliza nome do motorista (trim/case) pra agrupar', () => {
    const escalas = [
      escala({ carga: '1', placaNorm: 'AAA1111', motorista: '  carlos silva  ' }),
      escala({ carga: '2', placaNorm: 'BBB2222', motorista: 'Carlos Silva' }),
    ]
    const r = detectarMotoristaMultiplasPlacas(escalas)
    expect(r).toHaveLength(1)
    expect(r[0].motorista?.toUpperCase()).toBe('CARLOS SILVA')
  })
})

describe('detectarCargaMultiRegiao', () => {
  function linhaGeo(overrides: Partial<LinhaGeocodificada> & Pick<LinhaGeocodificada, 'carga' | 'nf'>): LinhaGeocodificada {
    return {
      destino: 'DESTINO',
      placa: 'AAA1111',
      motorista: 'MOTORISTA',
      ajudantes: [],
      clienteCodigo: 'CLI1',
      clienteNome: 'CLIENTE',
      endereco: 'ENDEREÇO',
      lat: null,
      lng: null,
      ...overrides,
    }
  }

  it('carga com NFs em uma só região -- sem aviso', () => {
    // Todos os pontos próximos (~0 km entre si)
    const linhas = [
      linhaGeo({ carga: '1', nf: 'NF1', lat: -22.9, lng: -43.2 }),
      linhaGeo({ carga: '1', nf: 'NF2', lat: -22.901, lng: -43.201 }),
    ]
    expect(detectarCargaMultiRegiao(linhas)).toEqual([])
  })

  it('carga com NFs em 2 regiões >60km -- aviso com distâncias', () => {
    // Campos dos Goytacazes ~ -21.75,-41.32 e Rio ~ -22.9,-43.2 => ~220km
    const linhas = [
      linhaGeo({ carga: '98593', nf: 'NF1', lat: -21.75, lng: -41.32 }),
      linhaGeo({ carga: '98593', nf: 'NF2', lat: -21.76, lng: -41.33 }),
      linhaGeo({ carga: '98593', nf: 'NF3', lat: -22.9, lng: -43.2 }),
    ]
    const r = detectarCargaMultiRegiao(linhas)
    expect(r).toHaveLength(1)
    expect(r[0].motivo).toBe('carga_multiregiao')
    expect(r[0].carga).toBe('98593')
    expect(r[0].distanciaKm).toBeGreaterThan(60)
  })

  it('carga com pontos <60km entre si -- sem aviso', () => {
    // Pontos a ~5km de distância
    const linhas = [
      linhaGeo({ carga: '1', nf: 'NF1', lat: -22.9, lng: -43.2 }),
      linhaGeo({ carga: '1', nf: 'NF2', lat: -22.94, lng: -43.24 }),
    ]
    expect(detectarCargaMultiRegiao(linhas)).toEqual([])
  })

  it('linhas sem coordenada são ignoradas', () => {
    const linhas = [
      linhaGeo({ carga: '1', nf: 'NF1', lat: -22.9, lng: -43.2 }),
      linhaGeo({ carga: '1', nf: 'NF2', lat: null, lng: null }),
    ]
    expect(detectarCargaMultiRegiao(linhas)).toEqual([])
  })

  it('múltiplas cargas -- cada uma avaliada independentemente', () => {
    const linhas = [
      // Carga 1: próxima, sem aviso
      linhaGeo({ carga: '1', nf: 'NF1', lat: -22.9, lng: -43.2 }),
      linhaGeo({ carga: '1', nf: 'NF2', lat: -22.901, lng: -43.201 }),
      // Carga 2: distante, com aviso
      linhaGeo({ carga: '2', nf: 'NF3', lat: -21.75, lng: -41.32 }),
      linhaGeo({ carga: '2', nf: 'NF4', lat: -22.9, lng: -43.2 }),
    ]
    const r = detectarCargaMultiRegiao(linhas)
    expect(r).toHaveLength(1)
    expect(r[0].carga).toBe('2')
  })
})
