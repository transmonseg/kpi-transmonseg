import { describe, it, expect } from 'vitest'
import { diaAnterior, escolherGeracao, type GeracaoRow } from './correcao-geocode-noturna'

describe('diaAnterior', () => {
  it('dia comum', () => {
    expect(diaAnterior('2026-09-23')).toBe('2026-09-22')
  })
  it('virada de mes', () => {
    expect(diaAnterior('2026-09-01')).toBe('2026-08-31')
  })
  it('virada de ano', () => {
    expect(diaAnterior('2026-01-01')).toBe('2025-12-31')
  })
  it('mes com 31 dias -> mes com 30', () => {
    expect(diaAnterior('2026-05-01')).toBe('2026-04-30')
  })
  it('ano bissexto: 1 de marco -> 29 de fevereiro', () => {
    expect(diaAnterior('2028-03-01')).toBe('2028-02-29')
  })
})

const row = (o: Partial<GeracaoRow>): GeracaoRow => ({
  id: 'x', gerado_em: '2026-09-22T10:00:00Z', romaneio_storage_path: 'p/x.pdf', ...o,
})

describe('escolherGeracao', () => {
  it('lista vazia -> null', () => {
    expect(escolherGeracao([])).toBeNull()
  })

  it('escolhe a de gerado_em mais recente', () => {
    const rows = [row({ id: 'a', gerado_em: '2026-09-22T08:00:00Z' }), row({ id: 'b', gerado_em: '2026-09-22T12:00:00Z' })]
    expect(escolherGeracao(rows)?.id).toBe('b')
  })

  it('ignora linhas com romaneio_storage_path nulo mesmo se mais recente', () => {
    const rows = [row({ id: 'a', gerado_em: '2026-09-22T08:00:00Z' }), row({ id: 'b', gerado_em: '2026-09-22T12:00:00Z', romaneio_storage_path: null })]
    expect(escolherGeracao(rows)?.id).toBe('a')
  })

  it('todas com path nulo -> null', () => {
    const rows = [row({ id: 'a', romaneio_storage_path: null }), row({ id: 'b', romaneio_storage_path: null })]
    expect(escolherGeracao(rows)).toBeNull()
  })

  it('empate exato de gerado_em -> pega alguma com path (nao quebra)', () => {
    const rows = [row({ id: 'a', gerado_em: '2026-09-22T10:00:00Z' }), row({ id: 'b', gerado_em: '2026-09-22T10:00:00Z' })]
    const escolhida = escolherGeracao(rows)
    expect(['a', 'b']).toContain(escolhida?.id)
  })
})
