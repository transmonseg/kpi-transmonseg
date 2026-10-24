import { describe, it, expect } from 'vitest'
import { chaveClienteLocal, localUtilizavel, aplicarLocaisClientes, consolidarEvidencias, marcarPontosCorroborados, nfsBarradasPelaTrava, paradaPropriaNoLocal, type LocalCliente } from './locais-clientes'
import type { LinhaGeocodificada } from './types'

const linha = (o: Partial<LinhaGeocodificada>): LinhaGeocodificada => ({
  carga: '99001', destino: 'X', placa: 'AAA1A11', motorista: 'M', ajudantes: [], nf: '1', clienteCodigo: '5778', clienteNome: 'CLIENTE', endereco: 'RUA A, 10 - CENTRO, RIO DE JANEIRO - * - 20000000',
  lat: -22.9, lng: -43.2, geoConfiavel: false, ...o,
} as LinhaGeocodificada)
const local = (o: Partial<LocalCliente>): LocalCliente => ({ chave: '5778', lat: -22.95, lng: -43.25, raioM: null, fonte: 'manual', confirmacoes: 1, enderecoRef: 'RUA A, 10 - CENTRO, RIO DE JANEIRO', ...o })

describe('chave do cliente', () => {
  it('código do cliente do romaneio principal; pão (NF no lugar do código) não entra', () => {
    expect(chaveClienteLocal(linha({}))).toBe('5778')
    expect(chaveClienteLocal(linha({ carga: 'PAO-9', clienteCodigo: '216553' }))).toBeNull()
    expect(chaveClienteLocal(linha({ clienteCodigo: '  ' }))).toBeNull()
  })
})

describe('local utilizável', () => {
  it('correção manual vale na hora; aprendido precisa de 2 confirmações', () => {
    expect(localUtilizavel(local({ fonte: 'manual', confirmacoes: 1 }))).toBe(true)
    expect(localUtilizavel(local({ fonte: 'entrega_confirmada', confirmacoes: 1 }))).toBe(false)
    expect(localUtilizavel(local({ fonte: 'entrega_confirmada', confirmacoes: 2 }))).toBe(true)
    expect(localUtilizavel(local({ fonte: 'parada_orfa', confirmacoes: 2 }))).toBe(true)
  })
})

describe('aplicarLocaisClientes', () => {
  const geoBom = { geoConfiavel: true }
  it('manual, mesmo endereço: troca e marca como verificada', () => {
    const { linhas, aplicados } = aplicarLocaisClientes([linha({ ...geoBom })], new Map([['5778', local({})]]))
    expect(linhas[0]).toMatchObject({ lat: -22.95, lng: -43.25, geoConfiavel: true, geoMotivo: undefined, geoVerificadoManual: true })
    expect(aplicados).toEqual(['1'])
  })
  it('cliente com vários endereços (texto diferente) e geocode do dia bom: não troca, nem manual', () => {
    const l = linha({ endereco: 'AV NOVA, 500 - BARRA, RIO DE JANEIRO - * - 22000000', lat: -23.0, lng: -43.4, ...geoBom })
    expect(aplicarLocaisClientes([l], new Map([['5778', local({})]])).aplicados).toEqual([])
    expect(aplicarLocaisClientes([l], new Map([['5778', local({ fonte: 'parada_orfa', confirmacoes: 2 })]])).aplicados).toEqual([])
  })
  it('geocode do dia ruim ou sem coordenada: usa o local (qualquer fonte utilizável)', () => {
    const ruim = linha({ endereco: 'R A 10 - CENTRO, RIO DE JANEIRO - * - 20000000', geoConfiavel: false })
    expect(aplicarLocaisClientes([ruim], new Map([['5778', local({ fonte: 'entrega_confirmada', confirmacoes: 3 })]])).aplicados).toEqual(['1'])
    expect(aplicarLocaisClientes([linha({ lat: null, lng: null })], new Map([['5778', local({ fonte: 'entrega_confirmada', confirmacoes: 2 })]])).aplicados).toEqual(['1'])
  })
  it('aprendido por entrega confirmada nunca troca geocode bom (o geocode pode ter sido corrigido depois)', () => {
    expect(aplicarLocaisClientes([linha({ ...geoBom })], new Map([['5778', local({ fonte: 'entrega_confirmada', confirmacoes: 5 })]])).aplicados).toEqual([])
  })
  it('parada órfã confirmada 2x, mesmo endereço: troca mesmo com geocode "bom" (era justamente o geocode errado)', () => {
    expect(aplicarLocaisClientes([linha({ ...geoBom })], new Map([['5778', local({ fonte: 'parada_orfa', confirmacoes: 2 })]])).aplicados).toEqual(['1'])
  })
  it('local aprendido corrige a coordenada mas não vira confiável nem "verificada" (só manual)', () => {
    const r = aplicarLocaisClientes([linha({ geoConfiavel: false })], new Map([['5778', local({ fonte: 'entrega_confirmada', confirmacoes: 3 })]]))
    expect(r.linhas[0]).toMatchObject({ lat: -22.95, lng: -43.25, geoConfiavel: false })
    expect(r.linhas[0].geoVerificadoManual).toBeFalsy()
  })
  it('local a mais de 15 km da coordenada do dia (cliente com endereço em outra cidade): não troca, nem com geocode ruim', () => {
    const longe = linha({ geoConfiavel: false, lat: -21.75, lng: -41.33 })
    expect(aplicarLocaisClientes([longe], new Map([['5778', local({ fonte: 'entrega_confirmada', confirmacoes: 3 })]])).aplicados).toEqual([])
  })
  it('sem local, ou local ainda não confirmado: deixa como está', () => {
    expect(aplicarLocaisClientes([linha({})], new Map()).aplicados).toEqual([])
    expect(aplicarLocaisClientes([linha({ geoConfiavel: false })], new Map([['5778', local({ fonte: 'entrega_confirmada', confirmacoes: 1 })]])).aplicados).toEqual([])
  })
})

describe('trava de 15 km x parada da propria placa no ponto aprendido (F1-07, KN-04 parte 1)', () => {
  // Caso real: CHURRASCARIA JACARE (163983), RBI0J25, 22/10, NF 2436616. Ponto
  // aprendido em Aperibe com 5 confirmacoes; geocode do dia 84 km longe (nao
  // confiavel); a placa parou 11 min a ~85 m do ponto aprendido (api-6).
  const jacareLocal = local({ chave: '163983', lat: -21.638572, lng: -42.099901, fonte: 'entrega_confirmada', confirmacoes: 5, enderecoRef: 'RODOVIA PRESIDENTE JOAO GOULART, S/N - APERIBÉ, APERIBE - ANEXO - 28495521' })
  const jacareNf = linha({
    carga: '100598', placa: 'RBI0J25', nf: '2436616', clienteCodigo: '163983', clienteNome: 'CHURRASCARIA JACARE',
    endereco: 'RODOVIA PRESIDENTE JOAO GOULART, S/N - APERIBÉ, APERIBE - ANEXO - 28495521',
    lat: -22.3736899, lng: -42.5470193, geoConfiavel: false,
  })
  const paradaApi6 = {
    lat: -21.6380733, lng: -42.0992783, chegada: '2026-10-22T09:11:39.000Z', saida: '2026-10-22T09:25:40.000Z',
    fim_real: '2026-10-22T09:22:39.000Z', duracao_seg: 660, classificacao: 'FORA_BASE',
  }
  const locais = new Map([['163983', jacareLocal]])

  it('sem parada da placa no ponto aprendido, a trava continua (comportamento antigo)', () => {
    expect(aplicarLocaisClientes([jacareNf], locais).aplicados).toEqual([])
    expect(aplicarLocaisClientes([jacareNf], locais, new Map([['RBI0J25', []]])).aplicados).toEqual([])
  })
  it('Jacare 22/10: geocode nao confiavel a 84 km + parada propria de 11 min a ~85 m -> usa o ponto aprendido', () => {
    const r = aplicarLocaisClientes([jacareNf], locais, new Map([['RBI0J25', [paradaApi6]]]))
    expect(r.aplicados).toEqual(['2436616'])
    expect(r.linhas[0]).toMatchObject({ lat: -21.638572, lng: -42.099901, geoConfiavel: false })
    expect(r.linhas[0].geoVerificadoManual).toBeFalsy()
  })
  it('parada curta (< 3 min), longe (> 100 m) ou na BASE nao destrava', () => {
    const curta = { ...paradaApi6, duracao_seg: 120, fim_real: '2026-10-22T09:13:39.000Z' }
    const longe = { ...paradaApi6, lat: -21.6400, lng: -42.0992783 } // ~165 m
    const base = { ...paradaApi6, classificacao: 'BASE' }
    for (const p of [curta, longe, base]) expect(aplicarLocaisClientes([jacareNf], locais, new Map([['RBI0J25', [p]]])).aplicados).toEqual([])
  })
  it('parada de OUTRA placa no ponto nao destrava (nao da credito a vizinho)', () => {
    expect(aplicarLocaisClientes([jacareNf], locais, new Map([['RQS7H76', [paradaApi6]]])).aplicados).toEqual([])
  })
  // R3 (revisao Fase 1): o local e' por CODIGO do cliente. Cliente com
  // varios enderecos (VIVACE: Rio x Campos) e a mesma placa nos dois: a
  // parada no endereco do Rio (entregando a NF do Rio) destravava a NF de
  // Campos (geocode nao confiavel a >15 km), que ia pro ponto do Rio e virava
  // ENTREGUE falso. So' destrava quando a NF e' do MESMO endereco do local.
  it('R3: VIVACE, geocode nao confiavel de OUTRO endereco (Campos) + parada no endereco do local (Rio) -> continua travado', () => {
    const vivaceLocal = local({ chave: '5778', lat: -22.9, lng: -43.2, fonte: 'entrega_confirmada', confirmacoes: 4, enderecoRef: 'RUA A, 10 - CENTRO, RIO DE JANEIRO' })
    const nfRio = linha({ nf: 'RIO', placa: 'AAA1A11', endereco: 'RUA A, 10 - CENTRO, RIO DE JANEIRO - * - 20000000', lat: -22.9001, lng: -43.2001, geoConfiavel: true })
    const nfCampos = linha({ nf: 'CAMPOS', placa: 'AAA1A11', endereco: 'AV PELINCA, 100 - CENTRO, CAMPOS DOS GOYTACAZES - * - 28000000', lat: -21.75, lng: -41.33, geoConfiavel: false })
    const parada = { ...paradaApi6, lat: -22.9003, lng: -43.2003 }
    const r = aplicarLocaisClientes([nfRio, nfCampos], new Map([['5778', vivaceLocal]]), new Map([['AAA1A11', [parada]]]))
    expect(r.aplicados).not.toContain('CAMPOS')
    expect(r.linhas[1]).toMatchObject({ lat: -21.75, lng: -41.33 })
  })
  it('R3: local sem endereco de referencia nao destrava a trava', () => {
    const semRef = { ...jacareLocal, enderecoRef: null }
    expect(aplicarLocaisClientes([jacareNf], new Map([['163983', semRef]]), new Map([['RBI0J25', [paradaApi6]]])).aplicados).toEqual([])
  })
  it('R3: mesmo endereco com e sem CEP no fim continua destravando (Jacare 22/10)', () => {
    const semCep = { ...jacareLocal, enderecoRef: 'RODOVIA PRESIDENTE JOAO GOULART, S/N - APERIBÉ, APERIBE - ANEXO' }
    expect(aplicarLocaisClientes([jacareNf], new Map([['163983', semCep]]), new Map([['RBI0J25', [paradaApi6]]])).aplicados).toEqual(['2436616'])
  })
  it('VIVACE com geocode confiavel a 20 km continua travado, mesmo com parada da placa no ponto aprendido', () => {
    const vivaceLocal = local({ chave: '5778', lat: -22.9, lng: -43.2, fonte: 'parada_orfa', confirmacoes: 4 })
    const vivaceNf = linha({ placa: 'AAA1A11', lat: -22.9, lng: -43.395, geoConfiavel: true }) // ~20 km a oeste
    const parada = { ...paradaApi6, lat: -22.9003, lng: -43.2003 }
    expect(aplicarLocaisClientes([vivaceNf], new Map([['5778', vivaceLocal]]), new Map([['AAA1A11', [parada]]])).aplicados).toEqual([])
  })
  it('nfsBarradasPelaTrava lista so as NFs com geocode nao confiavel barradas pela distancia', () => {
    const perto = linha({ nf: '9', geoConfiavel: false })
    const confiavelLonge = linha({ nf: '8', geoConfiavel: true, lat: -21.75, lng: -41.33 })
    expect(nfsBarradasPelaTrava([jacareNf, perto, confiavelLonge], new Map([...locais, ['5778', local({ fonte: 'entrega_confirmada', confirmacoes: 3 })]])).map(l => l.nf)).toEqual(['2436616'])
  })
  it('paradaPropriaNoLocal: >= 3 min a <= 100 m, fora da base', () => {
    expect(paradaPropriaNoLocal([paradaApi6], jacareLocal)).toBe(true)
    expect(paradaPropriaNoLocal([], jacareLocal)).toBe(false)
  })
})

describe('consolidarEvidencias (aprendizado)', () => {
  it('local = mediana das evidências que concordam (até 200 m da mediana)', () => {
    const r = consolidarEvidencias([
      { lat: -22.9000, lng: -43.2000 }, { lat: -22.9004, lng: -43.2003 }, { lat: -22.9002, lng: -43.2001 }, { lat: -23.5, lng: -44 },
    ])!
    expect(r.confirmacoes).toBe(3)
    expect(r.lat).toBeCloseTo(-22.9002, 4)
    expect(r.lng).toBeCloseTo(-43.2001, 4)
  })
  it('sem evidência: null', () => {
    expect(consolidarEvidencias([])).toBeNull()
  })
})

describe('marcarPontosCorroborados (GN-01, auditoria 20/10)', () => {
  const nf = (o: Partial<LinhaGeocodificada>) => ({ ...linha({ lat: -22.95, lng: -43.25 }), ...o }) as LinhaGeocodificada
  it('local utilizavel a <= 150 m do ponto do dia marca o ponto como confirmado', () => {
    const [l] = marcarPontosCorroborados([nf({})], new Map([['5778', local({ fonte: 'entrega_confirmada', confirmacoes: 3, lat: -22.9505 })]]))
    expect(l.pontoCorroborado).toBe(true)
  })
  it('local com 1 confirmacao, longe (> 150 m) ou sem coordenada no dia nao marca', () => {
    const umaSo = marcarPontosCorroborados([nf({})], new Map([['5778', local({ fonte: 'entrega_confirmada', confirmacoes: 1 })]]))
    const longe = marcarPontosCorroborados([nf({})], new Map([['5778', local({ lat: -22.96 })]]))
    const semGeo = marcarPontosCorroborados([nf({ lat: null, lng: null })], new Map([['5778', local({})]]))
    expect([umaSo[0].pontoCorroborado, longe[0].pontoCorroborado, semGeo[0].pontoCorroborado]).toEqual([undefined, undefined, undefined])
  })
})
