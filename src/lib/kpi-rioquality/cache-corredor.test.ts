import { describe, it, expect, vi } from 'vitest'
import { lerCorredorDoCache, gravarCorredorNoCache, VALIDADE_CACHE_CORREDOR_MS } from './cache-corredor'

// Cliente falso de kpi_cache_dia: guarda as linhas em memoria e responde ao
// select().eq().like() e ao upsert() que o modulo usa.
function clienteFalso(linhasIniciais: { chave: string; data: string; valor: unknown; gravado_em: string }[] = []) {
  const linhas = new Map(linhasIniciais.map(l => [l.chave, l]))
  const upserts: unknown[][] = []
  const cliente = {
    from: () => ({
      select: () => ({
        eq: (_c: string, data: string) => ({
          like: async (_c2: string, padrao: string) => ({
            data: [...linhas.values()].filter(l => l.data === data && l.chave.startsWith(padrao.replace(/%$/, ''))),
            error: null,
          }),
        }),
      }),
      upsert: async (novas: { chave: string; data: string; valor: unknown; gravado_em: string }[]) => {
        upserts.push(novas)
        for (const n of novas) linhas.set(n.chave, n)
        return { error: null }
      },
    }),
  }
  return { cliente: (() => cliente) as never, linhas, upserts }
}

const DATA = '2026-10-23'
const AGORA = Date.parse('2026-10-23T20:34:00Z')
// Rua real da RQ de 23/10 (KWM9877), pontos de dois municipios.
const PONTOS = [{ lat: -22.973, lng: -43.39, municipioCodigo: '3304557' }, { lat: -22.97, lng: -43.41, municipioCodigo: '3304557' }]

describe('cache do corredor da rua (F2-01 b)', () => {
  it('grava a resposta boa e le de volta so as ruas pedidas, dentro de 1 dia', async () => {
    const f = clienteFalso()
    expect(await gravarCorredorNoCache(DATA, new Map([['AVENIDA EMBAIXADOR ABELARDO BUENO', PONTOS], ['RUA SEM PONTO', []]]), { agoraMs: AGORA, cliente: f.cliente })).toBe(2)
    const lido = await lerCorredorDoCache(DATA, ['AVENIDA EMBAIXADOR ABELARDO BUENO', 'RUA SEM PONTO', 'RUA NUNCA PEDIDA'], { agoraMs: AGORA + 3600_000, cliente: f.cliente })
    expect(lido.get('AVENIDA EMBAIXADOR ABELARDO BUENO')).toEqual(PONTOS)
    expect(lido.get('RUA SEM PONTO')).toEqual([])
    expect(lido.has('RUA NUNCA PEDIDA')).toBe(false)
  })

  it('resposta com mais de 1 dia nao vale; outro dia nao vale', async () => {
    const f = clienteFalso()
    await gravarCorredorNoCache(DATA, new Map([['RUA X', PONTOS]]), { agoraMs: AGORA, cliente: f.cliente })
    expect((await lerCorredorDoCache(DATA, ['RUA X'], { agoraMs: AGORA + VALIDADE_CACHE_CORREDOR_MS + 1, cliente: f.cliente })).size).toBe(0)
    expect((await lerCorredorDoCache('2026-10-22', ['RUA X'], { agoraMs: AGORA, cliente: f.cliente })).size).toBe(0)
  })

  it('nao regrava rua guardada ha menos de 6 h (o tick roda a cada 10 min)', async () => {
    const f = clienteFalso()
    await gravarCorredorNoCache(DATA, new Map([['RUA X', PONTOS]]), { agoraMs: AGORA, cliente: f.cliente })
    expect(await gravarCorredorNoCache(DATA, new Map([['RUA X', PONTOS], ['RUA Y', PONTOS]]), { agoraMs: AGORA + 600_000, cliente: f.cliente })).toBe(1)
    expect(await gravarCorredorNoCache(DATA, new Map([['RUA X', PONTOS]]), { agoraMs: AGORA + 7 * 3600_000, cliente: f.cliente })).toBe(1)
  })

  it('falha do banco nao derruba nada (sem cache)', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    const quebrado = (() => ({ from: () => { throw new Error('banco fora') } })) as never
    expect((await lerCorredorDoCache(DATA, ['RUA X'], { cliente: quebrado })).size).toBe(0)
    expect(await gravarCorredorNoCache(DATA, new Map([['RUA X', PONTOS]]), { cliente: quebrado })).toBe(0)
    erro.mockRestore()
  })
})
