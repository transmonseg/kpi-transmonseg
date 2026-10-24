import { describe, it, expect } from 'vitest'
import { marcarPontoUnitracRepetido } from './gerar-nutrimax'
import { aplicarLocaisClientes } from './locais-clientes'
import type { LinhaGeocodificada } from './types'

// Regra B (diagnostico 24/10, gabarito 24/09 -- RQV9E37/2388087 DECK GRILL): o
// ponto -21.626775,-41.019232 e' um cadastro generico da Unitrac, o mesmo de 4
// clientes (164702 Deck Grill, 154177 Mercearia do Eduardo, 163800, 160992). A
// correcao noturna de 14/10 o gravou no cache do Deck Grill (fonte
// cadastro_unitrac); o Eduardo tem o mesmo ponto como verificacao_manual.
const PONTO_GENERICO = { lat: -21.626775, lng: -41.019232 }
function l(nf: string, o: Partial<LinhaGeocodificada>): LinhaGeocodificada {
  return {
    carga: '98600', destino: 'SAO JOAO DA BARRA', placa: 'RQV9E37', motorista: '', ajudantes: [], nf,
    clienteCodigo: '', clienteNome: '', endereco: '', lat: null, lng: null, ...o,
  }
}
const deck = l('2388087', { clienteCodigo: '164702', clienteNome: 'DECK GRILL', endereco: 'AVENIDA HORMES MAIA, SN - SOLAR DO MARANHAO, SAO JOAO DA BAR - LOJA ESQUINA', ...PONTO_GENERICO, geoFonte: 'cadastro_unitrac' })
const eduardo = l('2388078', { clienteCodigo: '154177', clienteNome: 'MERCEARIA DO EDUARDO', endereco: 'ESTRADA QUIXABA, SN - QUIXABA, SAO JOAO DA BARRA', ...PONTO_GENERICO, geoFonte: 'verificacao_manual' })
const longe = l('2388090', { clienteCodigo: '170000', clienteNome: 'OUTRO', endereco: 'RUA A, 1 - CENTRO, SAO JOAO DA BARRA', lat: -21.64, lng: -41.05, geoFonte: 'cnefe' })
const marcado = (ls: LinhaGeocodificada[], nf: string) => marcarPontoUnitracRepetido(ls).find(x => x.nf === nf)!.pontoUnitracRepetido === true

describe('marcarPontoUnitracRepetido (regra B)', () => {
  it('RQV9E37 24/09: Deck Grill (cadastro_unitrac) no mesmo ponto do Eduardo -> marcado; Eduardo (verificacao_manual) nao', () => {
    const ls = [deck, eduardo, longe]
    expect(marcado(ls, '2388087')).toBe(true)
    expect(marcado(ls, '2388078')).toBe(false)
    expect(marcado(ls, '2388090')).toBe(false)
  })

  it('ponto identico so em outra placa -> nao marca', () => {
    expect(marcado([deck, { ...eduardo, placa: 'RQV9E38' }], '2388087')).toBe(false)
  })

  // Dry run 20 e 23/10 (UNN3A68, RQU1G17): lojas diferentes do MESMO endereco
  // (Av. das Americas 4666, quiosques da Av. Atlantica S/N) dividem o ponto do
  // predio -- isso nao e' cadastro generico. So' conta outro endereco.
  it('UNN3A68 20/10: lojas diferentes no mesmo endereco (shopping) com o mesmo ponto -> nao marca', () => {
    const shop = { lat: -22.997927, lng: -43.360653 }
    const kilograma = l('2433457', { placa: 'UNN3A68', clienteCodigo: '120001', clienteNome: 'KILOGRAMA', endereco: 'AV DAS AMERICAS, 4666 - BARRA DA TIJUCA, RIO DE JANEIRO - LOJA 106 P12', ...shop, geoFonte: 'cadastro_unitrac' })
    const oliva = l('2433441', { placa: 'UNN3A68', clienteCodigo: '120002', clienteNome: 'OLIVA', endereco: 'AVENIDA DAS AMÉRICAS , 4666 - BARRA DA TIJUCA, RIO DE JANEIRO - LOJA 23', ...shop, geoFonte: 'cadastro_unitrac' })
    expect(marcado([kilograma, oliva], '2433457')).toBe(false)
    expect(marcado([kilograma, oliva], '2433441')).toBe(false)
  })

  it('duas NFs do MESMO cliente no mesmo ponto -> nao marca', () => {
    expect(marcado([deck, { ...deck, nf: '2388088' }], '2388087')).toBe(false)
  })

  it('outro cliente a 30 m (nao identico) -> nao marca', () => {
    expect(marcado([deck, { ...eduardo, lat: PONTO_GENERICO.lat + 0.00027 }], '2388087')).toBe(false)
  })

  it('local corrigido a mao (manual) no mesmo ponto: deixa de ser ponto do cadastro Unitrac -> nao marca', () => {
    const local = { chave: '164702', ...PONTO_GENERICO, raioM: null, fonte: 'manual' as const, confirmacoes: 0, enderecoRef: deck.endereco }
    const { linhas } = aplicarLocaisClientes([deck, eduardo], new Map([['164702', local]]))
    expect(linhas[0].geoFonte).toBe('manual')
    expect(marcado(linhas, '2388087')).toBe(false)
  })

  it('compara a coordenada FINAL (depois dos locais aprendidos): cadastro_unitrac movido pelo local nao bate mais', () => {
    expect(marcado([{ ...deck, lat: -21.63, lng: -41.02 }, eduardo], '2388087')).toBe(false)
  })
})
