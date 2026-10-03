import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  montarLoteRegeocode,
  aplicarRegeocodeNoturno,
  TETO_REGEOCODE_NOITE,
  FONTES_PROTEGIDAS,
  type CandidatoRegeocode,
  type ClienteCacheRegeocode,
} from './regeocode-noturno-imprecisos'
import type { LinhaCacheAtual } from './aplicar-correcoes-geocode'

function candidato(overrides: Partial<CandidatoRegeocode> = {}): CandidatoRegeocode {
  return {
    endereco: 'RUA TESTE 123',
    lat: -22.9,
    lng: -43.2,
    fonte: null,
    confiavel: false,
    motivo: 'coordenada imprecisa',
    nomeCliente: 'CLIENTE X',
    cidade: 'RIO DE JANEIRO',
    cep: '20000-000',
    ...overrides,
  }
}

function linhaCache(overrides: Partial<LinhaCacheAtual> = {}): LinhaCacheAtual {
  return {
    endereco: 'RUA TESTE 123',
    lat: -22.9,
    lng: -43.2,
    confiavel: false,
    fonte: null,
    motivo: 'coordenada imprecisa',
    ...overrides,
  }
}

describe('regeocode noturno imprecisos', () => {
  let upserts: unknown[]
  let svc: ClienteCacheRegeocode

  beforeEach(() => {
    upserts = []
    svc = {
      from: (tabela: string) => ({
        select: (_colunas: string) => ({
          in: async (_coluna: string, _valores: string[]) => ({ data: [], error: null }),
        }),
        upsert: async (linha: unknown, _opcoes: { onConflict: string }) => {
          upserts.push(linha)
          return { data: null, error: null }
        },
      }),
    }
  })

  it('atualiza cache quando geocoder retorna coordenada melhor', () => {
    const candidatos = [candidato({ endereco: 'RUA BOA 100', lat: -22.95, lng: -43.18 })]
    const cacheAtual = new Map<string, LinhaCacheAtual>([
      ['RUA BOA 100', linhaCache({ endereco: 'RUA BOA 100', lat: -22.96, lng: -43.19 })],
    ])
    // Nova coord dentro do RJ e mais proxima do alvo (simulado: alvo em -22.94, -43.17)
    const novaCoord = { lat: -22.945, lng: -43.175 }
    const resultado = montarLoteRegeocode(candidatos, cacheAtual, novaCoord)
    expect(resultado.gravar.length).toBe(1)
    expect(resultado.gravar[0].endereco).toBe('RUA BOA 100')
    expect(resultado.gravar[0].fonte).toBe('regeocode_noturno')
    expect(resultado.gravar[0].confiavel).toBe(true)
  })

  it('nao atualiza quando geocoder falha (coord nula)', () => {
    const candidatos = [candidato()]
    const cacheAtual = new Map<string, LinhaCacheAtual>()
    const resultado = montarLoteRegeocode(candidatos, cacheAtual, null)
    expect(resultado.gravar.length).toBe(0)
  })

  it('nunca sobrescreve fonte manual/verificacao_manual/cadastro_unitrac', () => {
    for (const fonteProtegida of ['manual', 'verificacao_manual', 'cadastro_unitrac']) {
      const candidatos = [candidato({ endereco: `END_${fonteProtegida}` })]
      const cacheAtual = new Map<string, LinhaCacheAtual>([
        [`END_${fonteProtegida}`, linhaCache({ endereco: `END_${fonteProtegida}`, fonte: fonteProtegida })],
      ])
      const novaCoord = { lat: -22.91, lng: -43.17 }
      const resultado = montarLoteRegeocode(candidatos, cacheAtual, novaCoord)
      expect(resultado.gravar.length).toBe(0)
      expect(resultado.pulados.some(p => p.endereco === `END_${fonteProtegida}` && p.motivo === 'fonte_protegida')).toBe(true)
    }
  })

  it('respeita teto de 30 correcoes por noite', () => {
    const candidatos: CandidatoRegeocode[] = Array.from({ length: 31 }, (_, i) =>
      candidato({ endereco: `END_${i}`, lat: -22.9, lng: -43.2 }),
    )
    const cacheAtual = new Map<string, LinhaCacheAtual>()
    // Coord valida dentro do RJ
    const novaCoord = { lat: -22.91, lng: -43.17 }
    const resultado = montarLoteRegeocode(candidatos, cacheAtual, novaCoord)
    expect(resultado.excedeuTeto).toBe(true)
    expect(resultado.gravar.length).toBe(0)
  })

  it('gera backup antes do primeiro upsert', async () => {
    const dirSaida = '/tmp/test-regeocode-backup-' + Date.now()
    const candidatos = [candidato({ endereco: 'RUA_BACKUP_1' })]
    const cacheAtual = new Map<string, LinhaCacheAtual>([
      ['RUA_BACKUP_1', linhaCache({ endereco: 'RUA_BACKUP_1', lat: -22.95, lng: -43.18, fonte: 'auto' })],
    ])
    const novaCoord = { lat: -22.94, lng: -43.17 }
    const lote = montarLoteRegeocode(candidatos, cacheAtual, novaCoord)
    expect(lote.gravar.length).toBe(1)

    const resultado = await aplicarRegeocodeNoturno(svc, lote.gravar, { dirSaida, log: () => {} })
    expect(resultado.caminhoBackup).toBeTruthy()
    expect(resultado.gravados.length).toBe(1)
  })

  it('pula coordenada fora do bounding box do RJ', () => {
    const candidatos = [candidato({ endereco: 'FORA_RJ' })]
    const cacheAtual = new Map<string, LinhaCacheAtual>()
    // Coordenada fora do RJ (Sao Paulo)
    const novaCoord = { lat: -23.55, lng: -46.63 }
    const resultado = montarLoteRegeocode(candidatos, cacheAtual, novaCoord)
    expect(resultado.gravar.length).toBe(0)
    expect(resultado.pulados.some(p => p.motivo === 'fora_do_rj')).toBe(true)
  })

  it('FONTES_PROTEGIDAS contem exatamente manual, verificacao_manual, cadastro_unitrac', () => {
    expect(FONTES_PROTEGIDAS.has('manual')).toBe(true)
    expect(FONTES_PROTEGIDAS.has('verificacao_manual')).toBe(true)
    expect(FONTES_PROTEGIDAS.has('cadastro_unitrac')).toBe(true)
    expect(FONTES_PROTEGIDAS.size).toBe(3)
  })

  it('TETO_REGEOCODE_NOITE e 30', () => {
    expect(TETO_REGEOCODE_NOITE).toBe(30)
  })
})