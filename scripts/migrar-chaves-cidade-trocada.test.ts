import { describe, it, expect } from 'vitest'
import { chaveAntiga, municipioDoEndereco, planejarMigracaoCidade, type LinhaCache } from './migrar-chaves-cidade-trocada'
import { chaveCacheEndereco } from '../src/lib/kpi-romaneio/endereco-cep'

// F1-14 (GEO-25): a chave do cache mudou so' nos enderecos cuja cidade era
// trocada. O plano leva pra chave nova SO' correcao humana (manual,
// verificacao_manual, cadastro_unitrac) de chave antiga que nao colidia com
// outra cidade; o resto (geocode automatico, feito na cidade errada) e'
// refeito pela cascata na proxima geracao.
const BARRA_MANSA = 'RUA SAO JOSE, 211 - SAO FRANCISCO DE ASSIS, BARRA MANSA - * - 27323790'
const SFI = 'RUA SAO JOSE, 211 - SAO FRANCISCO D - * - 28230-000'
const linha = (o: Partial<LinhaCache>): LinhaCache => ({ endereco: '', lat: -22.5, lng: -44.1, fonte: 'cnefe', confiavel: true, motivo: null, precisao: null, ...o })

describe('chaves e municipio', () => {
  it('chave antiga trocava a cidade; a nova traz Barra Mansa', () => {
    expect(chaveAntiga(BARRA_MANSA)).toBe('RUA SAO JOSE, 211 - SÃO FRANCISCO DE ITABAPOANA - *')
    expect(chaveCacheEndereco(BARRA_MANSA)).toBe('RUA SAO JOSE, 211 - SAO FRANCISCO DE ASSIS, BARRA MANSA')
    expect(municipioDoEndereco(BARRA_MANSA)).toBe('BARRA MANSA')
    expect(municipioDoEndereco('AVENIDA CASTELO BRANCO, 49 - CENTRO, TRAJANO DE MORA - * - 28750-000')).toBe('TRAJANO DE MORAES')
  })
})

describe('planejarMigracaoCidade', () => {
  it('endereco cuja chave nao mudou fica fora do plano', () => {
    const p = planejarMigracaoCidade([{ endereco: 'AVENIDA ATLANTICA, 2534 - CAVALEIROS, MACAE - * - 27920390', nfs: 3 }], new Map())
    expect(p).toEqual([])
  })
  it('correcao humana na chave antiga sem colisao: migrar', () => {
    const antiga = chaveAntiga(BARRA_MANSA)
    const p = planejarMigracaoCidade([{ endereco: BARRA_MANSA, nfs: 2 }], new Map([[antiga, linha({ endereco: antiga, fonte: 'verificacao_manual' })]]))
    expect(p).toHaveLength(1)
    expect(p[0]).toMatchObject({ chaveAntiga: antiga, chaveNova: chaveCacheEndereco(BARRA_MANSA), acao: 'migrar', municipio: 'BARRA MANSA', nfs: 2 })
  })
  it('geocode automatico na chave antiga (feito na cidade errada): nao leva, refaz', () => {
    const antiga = chaveAntiga(BARRA_MANSA)
    const p = planejarMigracaoCidade([{ endereco: BARRA_MANSA, nfs: 2 }], new Map([[antiga, linha({ endereco: antiga, fonte: 'cnefe' })]]))
    expect(p[0].acao).toBe('refazer_geocode')
  })
  it('chave antiga compartilhada por duas cidades (colisao) com correcao humana: revisar, nunca migrar sozinho', () => {
    const antiga = chaveAntiga(BARRA_MANSA)
    expect(chaveAntiga(SFI)).toBe(antiga)
    const p = planejarMigracaoCidade([{ endereco: BARRA_MANSA, nfs: 1 }, { endereco: SFI, nfs: 1 }], new Map([[antiga, linha({ endereco: antiga, fonte: 'manual' })]]))
    expect(p.map(x => x.acao)).toEqual(['revisar_colisao'])
    expect(p[0].colisao).toEqual(['BARRA MANSA', 'SAO FRANCISCO DE ITABAPOANA'])
  })
  it('chave nova ja tem correcao humana: mantem a nova', () => {
    const antiga = chaveAntiga(BARRA_MANSA), nova = chaveCacheEndereco(BARRA_MANSA)
    const p = planejarMigracaoCidade([{ endereco: BARRA_MANSA, nfs: 1 }], new Map([
      [antiga, linha({ endereco: antiga, fonte: 'manual' })], [nova, linha({ endereco: nova, fonte: 'manual', lat: -22.54 })],
    ]))
    expect(p[0].acao).toBe('manter_nova')
  })
  it('sem nada no cache: refaz na proxima geracao', () => {
    expect(planejarMigracaoCidade([{ endereco: BARRA_MANSA, nfs: 1 }], new Map())[0].acao).toBe('refazer_geocode')
  })
})
