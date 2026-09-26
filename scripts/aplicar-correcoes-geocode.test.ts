import { describe, it, expect } from 'vitest'
import { parseCsvCorrecoes, montarUpserts, csvBackup, type LinhaCacheAtual } from './aplicar-correcoes-geocode'

describe('parseCsvCorrecoes', () => {
  it('parseia endereco;lat;lng;fonte;evidencia, ignorando cabecalho', () => {
    const csv = 'endereco;lat;lng;fonte;evidencia\nRUA X, 1 - CENTRO;-22.1;-43.1;cadastro Unitrac;evidencia simples\n'
    expect(parseCsvCorrecoes(csv)).toEqual([
      { endereco: 'RUA X, 1 - CENTRO', lat: -22.1, lng: -43.1, fonte: 'cadastro Unitrac', evidencia: 'evidencia simples' },
    ])
  })

  it('evidencia entre aspas com virgula e ponto-e-virgula nao quebra a linha', () => {
    const csv = 'endereco;lat;lng;fonte;evidencia\nRUA Y, 2;-22.2;-43.2;cadastro Unitrac;"Parada a 344 m (20.0 min); GPS 12346 m, nossa coord 1.0 km fora."\n'
    const linhas = parseCsvCorrecoes(csv)
    expect(linhas).toHaveLength(1)
    expect(linhas[0].evidencia).toBe('Parada a 344 m (20.0 min); GPS 12346 m, nossa coord 1.0 km fora.')
  })

  it('aspas duplicadas dentro do campo (escape CSV) viram uma aspa', () => {
    const csv = 'endereco;lat;lng;fonte;evidencia\nRUA Z, 3;-22.3;-43.3;cadastro Unitrac;"Equipe marcou ""Nao foi ao local""."\n'
    expect(parseCsvCorrecoes(csv)[0].evidencia).toBe('Equipe marcou "Nao foi ao local".')
  })

  it('sem linhas de dados alem do cabecalho -> lista vazia', () => {
    expect(parseCsvCorrecoes('endereco;lat;lng;fonte;evidencia\n')).toEqual([])
  })

  it('linhas em branco no fim sao ignoradas', () => {
    const csv = 'endereco;lat;lng;fonte;evidencia\nRUA X, 1;-22.1;-43.1;fonte;ev\n\n'
    expect(parseCsvCorrecoes(csv)).toHaveLength(1)
  })
})

describe('montarUpserts', () => {
  const correcao = { endereco: 'RUA X, 1 - CENTRO', lat: -22.1, lng: -43.1, fonte: 'cadastro Unitrac', evidencia: 'ev' }

  it('endereco sem linha no cache (ausente) -> grava normalmente com fonte verificacao_manual', () => {
    const { gravar, pulados } = montarUpserts([correcao], new Map())
    expect(gravar).toEqual([{ endereco: 'RUA X, 1 - CENTRO', lat: -22.1, lng: -43.1, confiavel: true, motivo: null, fonte: 'verificacao_manual' }])
    expect(pulados).toEqual([])
  })

  it('endereco com fonte atual != manual -> grava, sobrescrevendo', () => {
    const cache = new Map<string, LinhaCacheAtual>([[correcao.endereco, { endereco: correcao.endereco, lat: -20, lng: -40, confiavel: false, fonte: 'cnefe', motivo: 'bairro_divergente' }]])
    const { gravar, pulados } = montarUpserts([correcao], cache)
    expect(gravar).toHaveLength(1)
    expect(pulados).toEqual([])
  })

  it('endereco com fonte atual === manual -> NUNCA sobrescreve, entra em pulados', () => {
    const cache = new Map<string, LinhaCacheAtual>([[correcao.endereco, { endereco: correcao.endereco, lat: -20, lng: -40, confiavel: true, fonte: 'manual', motivo: null }]])
    const { gravar, pulados } = montarUpserts([correcao], cache)
    expect(gravar).toEqual([])
    expect(pulados).toEqual([{ endereco: correcao.endereco, motivo: 'fonte_manual' }])
  })

  it('varias correcoes: mistura de gravar e pulado', () => {
    const manual = { ...correcao, endereco: 'RUA MANUAL, 9' }
    const cache = new Map<string, LinhaCacheAtual>([[manual.endereco, { endereco: manual.endereco, lat: 0, lng: 0, confiavel: true, fonte: 'manual', motivo: null }]])
    const { gravar, pulados } = montarUpserts([correcao, manual], cache)
    expect(gravar.map(g => g.endereco)).toEqual([correcao.endereco])
    expect(pulados.map(p => p.endereco)).toEqual([manual.endereco])
  })
})

describe('csvBackup', () => {
  it('uma linha por registro, escapando ; e quebra de linha', () => {
    const csv = csvBackup([{ endereco: 'A;B\nC', lat: 1, lng: 2, confiavel: false, fonte: 'nominatim', motivo: 'bairro' }])
    expect(csv.split('\n')[1]).toBe('A,B,C;1;2;false;nominatim;bairro')
  })

  it('linha ausente do cache (nulls) nao quebra o CSV', () => {
    const csv = csvBackup([{ endereco: 'RUA SEM CACHE', lat: null, lng: null, confiavel: null, fonte: null, motivo: null }])
    expect(csv.split('\n')[1]).toBe('RUA SEM CACHE;;;;;')
  })
})
