import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  diaAnterior, escolherGeracao, type GeracaoRow,
  aplicarHabilitado, montarLoteNoturno, aplicarCadastroNoturno, aplicarSeHabilitado, TETO_CORRECOES_NOITE, LIMITE_ANOMALIA_NOITE,
} from './correcao-geocode-noturna'
import type { SugestaoCadastro } from '../src/lib/kpi-romaneio/cadastro-unitrac'
import type { LinhaCacheAtual } from './aplicar-correcoes-geocode'

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

// ---------- aplicacao noturna (regra forte: cadastro Unitrac confirmado por parada GPS) ----------

const sug = (o: Partial<SugestaoCadastro>): SugestaoCadastro => ({
  endereco: 'RUA A, 1', nfs: ['100'], placaNorm: 'AAA1A11', latAtual: -22.60, lngAtual: -43.20, distAtualM: 1500,
  fonteAtual: 'nominatim', latNova: -22.61, lngNova: -43.21, codigoUnitrac: '5904', distParadaM: 80, ...o,
})
const linha = (o: Partial<LinhaCacheAtual>): LinhaCacheAtual => ({
  endereco: 'RUA A, 1', lat: -22.60, lng: -43.20, confiavel: false, fonte: 'nominatim', motivo: 'x', ...o,
})
const nSug = (n: number) => Array.from({ length: n }, (_, i) => sug({ endereco: `RUA ${i}, 1` }))

describe('aplicarHabilitado', () => {
  it('so\' com GEOCODE_NOTURNO_APLICAR=1', () => {
    expect(aplicarHabilitado({})).toBe(false)
    expect(aplicarHabilitado({ GEOCODE_NOTURNO_APLICAR: '0' })).toBe(false)
    expect(aplicarHabilitado({ GEOCODE_NOTURNO_APLICAR: 'true' })).toBe(false)
    expect(aplicarHabilitado({ GEOCODE_NOTURNO_APLICAR: '1' })).toBe(true)
  })
})

describe('montarLoteNoturno', () => {
  it('grava como fonte cadastro_unitrac, confiavel, motivo limpo', () => {
    const r = montarLoteNoturno([sug({})], new Map([['RUA A, 1', linha({})]]))
    expect(r.excedeuTeto).toBe(false)
    expect(r.gravar).toEqual([{ endereco: 'RUA A, 1', lat: -22.61, lng: -43.21, confiavel: true, motivo: null, fonte: 'cadastro_unitrac' }])
  })

  it('endereco ausente do cache entra normalmente', () => {
    expect(montarLoteNoturno([sug({})], new Map()).gravar).toHaveLength(1)
  })

  it.each(['manual', 'verificacao_manual', 'cadastro_unitrac'])('nunca sobrescreve fonte %s (estado ATUAL do cache)', fonte => {
    // fonteAtual da sugestao pode estar velho -- vale o que o cache tem agora
    const r = montarLoteNoturno([sug({ fonteAtual: 'nominatim' })], new Map([['RUA A, 1', linha({ fonte })]]))
    expect(r.gravar).toEqual([])
    expect(r.pulados).toEqual([{ endereco: 'RUA A, 1', motivo: 'fonte_protegida' }])
  })

  it('sobrescreve fontes automaticas (nominatim, parada_alvo)', () => {
    const r = montarLoteNoturno([sug({ endereco: 'A' }), sug({ endereco: 'B' })],
      new Map([['A', linha({ endereco: 'A', fonte: 'nominatim' })], ['B', linha({ endereco: 'B', fonte: 'parada_alvo' })]]))
    expect(r.gravar.map(g => g.endereco)).toEqual(['A', 'B'])
  })

  it('coordenada fora do RJ -> pula', () => {
    const r = montarLoteNoturno([sug({ latNova: -23.55, lngNova: -46.63 }), sug({ endereco: 'B', latNova: NaN })], new Map())
    expect(r.gravar).toEqual([])
    expect(r.pulados.map(p => p.motivo)).toEqual(['fora_do_rj', 'fora_do_rj'])
  })

  it('exatamente no teto grava tudo', () => {
    const r = montarLoteNoturno(nSug(TETO_CORRECOES_NOITE), new Map())
    expect(TETO_CORRECOES_NOITE).toBe(30)
    expect(r.excedeuTeto).toBe(false)
    expect(r.gravar).toHaveLength(30)
  })

  it('acima do teto grava so\' as mais fortes (menor distancia da parada)', () => {
    const sugs = Array.from({ length: 35 }, (_, i) => sug({ endereco: `RUA ${i}, 1`, distParadaM: 200 - i }))
    const r = montarLoteNoturno(sugs, new Map())
    expect(r.excedeuTeto).toBe(false)
    expect(r.gravar).toHaveLength(30)
    expect(r.adiados).toBe(5)
    expect(r.candidatos).toBe(35)
    expect(r.gravar.map(g => g.endereco)).not.toContain('RUA 0, 1')
    expect(r.gravar.map(g => g.endereco)).toContain('RUA 34, 1')
  })

  it('acima do limite de anomalia nao grava NADA', () => {
    expect(LIMITE_ANOMALIA_NOITE).toBe(300)
    const r = montarLoteNoturno(nSug(301), new Map())
    expect(r.excedeuTeto).toBe(true)
    expect(r.gravar).toEqual([])
    expect(r.candidatos).toBe(301)
  })

  it('teto conta so\' o que sobra depois das protecoes', () => {
    const sugs = nSug(32)
    const cache = new Map([['RUA 0, 1', linha({ endereco: 'RUA 0, 1', fonte: 'manual' })], ['RUA 1, 1', linha({ endereco: 'RUA 1, 1', fonte: 'verificacao_manual' })]])
    const r = montarLoteNoturno(sugs, cache)
    expect(r.excedeuTeto).toBe(false)
    expect(r.gravar).toHaveLength(30)
  })
})

type Chamada = { op: 'select' | 'upsert'; tabela: string; arg: unknown }
function mockSvc(opts: { cache?: LinhaCacheAtual[]; falharUpsertEm?: string; aoUpsert?: () => void } = {}) {
  const chamadas: Chamada[] = []
  const svc = {
    from(tabela: string) {
      return {
        select: () => ({
          in: async (_col: string, vals: string[]) => {
            chamadas.push({ op: 'select', tabela, arg: vals })
            return { data: (opts.cache ?? []).filter(l => vals.includes(l.endereco)), error: null }
          },
        }),
        upsert: async (row: { endereco: string }, o: unknown) => {
          opts.aoUpsert?.()
          chamadas.push({ op: 'upsert', tabela, arg: { row, o } })
          if (row.endereco === opts.falharUpsertEm) return { error: { message: 'boom' } }
          return { error: null }
        },
      }
    },
  }
  return { svc, chamadas }
}

describe('aplicarCadastroNoturno', () => {
  let dir: string
  const logs: string[] = []
  const log = (m: string) => { logs.push(m) }
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'noturno-')); logs.length = 0 })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('grava backup-antes-aplicar.csv ANTES do primeiro upsert, com o estado anterior', async () => {
    const caminho = join(dir, 'backup-antes-aplicar.csv')
    let backupExistiaNoUpsert = false
    const { svc, chamadas } = mockSvc({
      cache: [linha({ endereco: 'RUA A, 1', lat: -22.6, lng: -43.2, confiavel: false, fonte: 'nominatim', motivo: 'longe' })],
      aoUpsert: () => { backupExistiaNoUpsert = existsSync(caminho) },
    })
    const r = await aplicarCadastroNoturno(svc, [sug({}), sug({ endereco: 'RUA NOVA, 2' })], { dirSaida: dir, log })
    expect(backupExistiaNoUpsert).toBe(true)
    expect(readFileSync(caminho, 'utf-8')).toBe('endereco;lat;lng;confiavel;fonte;motivo\nRUA A, 1;-22.6;-43.2;false;nominatim;longe\nRUA NOVA, 2;;;;;\n')
    expect(r.gravados).toEqual(['RUA A, 1', 'RUA NOVA, 2'])
    const ups = chamadas.filter(c => c.op === 'upsert')
    expect(ups).toHaveLength(2)
    expect(ups.every(c => c.tabela === 'kpi_romaneio_geocode_cache')).toBe(true)
    expect((ups[0].arg as { o: unknown }).o).toEqual({ onConflict: 'endereco' })
  })

  it('2a execucao no mesmo dia nao apaga o backup da 1a (append sem novo cabecalho)', async () => {
    const caminho = join(dir, 'backup-antes-aplicar.csv')
    const a = mockSvc({ cache: [linha({ endereco: 'RUA A, 1', lat: -22.6, lng: -43.2, confiavel: false, fonte: 'nominatim', motivo: 'longe' })] })
    await aplicarCadastroNoturno(a.svc, [sug({})], { dirSaida: dir, log })
    const b = mockSvc({ cache: [linha({ endereco: 'RUA B, 9', lat: -22.7, lng: -43.3, confiavel: false, fonte: 'nominatim', motivo: 'longe' })] })
    await aplicarCadastroNoturno(b.svc, [sug({ endereco: 'RUA B, 9' })], { dirSaida: dir, log })
    expect(readFileSync(caminho, 'utf-8')).toBe('endereco;lat;lng;confiavel;fonte;motivo\nRUA A, 1;-22.6;-43.2;false;nominatim;longe\nRUA B, 9;-22.7;-43.3;false;nominatim;longe\n')
  })

  it('acima do limite de anomalia: nenhum upsert, nenhum backup, loga excedeu o teto', async () => {
    const { svc, chamadas } = mockSvc()
    const r = await aplicarCadastroNoturno(svc, nSug(31), { dirSaida: dir, log, limiteAnomalia: 30 })
    expect(chamadas.filter(c => c.op === 'upsert')).toHaveLength(0)
    expect(existsSync(join(dir, 'backup-antes-aplicar.csv'))).toBe(false)
    expect(r.excedeuTeto).toBe(true)
    expect(logs.join('\n')).toContain('excedeu o teto — revisão manual')
  })

  it('fonte manual no cache atual: nao faz upsert dela', async () => {
    const { svc, chamadas } = mockSvc({ cache: [linha({ fonte: 'manual' })] })
    const r = await aplicarCadastroNoturno(svc, [sug({})], { dirSaida: dir, log })
    expect(chamadas.filter(c => c.op === 'upsert')).toHaveLength(0)
    expect(r.gravados).toEqual([])
    expect(logs.join('\n')).toContain('fonte_protegida')
  })

  it('coordenada fora do RJ: pula e loga, grava o resto', async () => {
    const { svc } = mockSvc()
    const r = await aplicarCadastroNoturno(svc, [sug({ endereco: 'SP', latNova: -23.55, lngNova: -46.63 }), sug({})], { dirSaida: dir, log })
    expect(r.gravados).toEqual(['RUA A, 1'])
    expect(logs.join('\n')).toMatch(/fora_do_rj.*SP/)
  })

  it('falha num upsert: rejeita e loga o que ja\' gravou', async () => {
    const { svc, chamadas } = mockSvc({ falharUpsertEm: 'RUA 1, 1' })
    await expect(aplicarCadastroNoturno(svc, nSug(3), { dirSaida: dir, log })).rejects.toThrow(/RUA 1, 1/)
    expect(chamadas.filter(c => c.op === 'upsert')).toHaveLength(2) // para no primeiro erro
    expect(logs.join('\n')).toMatch(/gravados antes da falha \(1\): RUA 0, 1/)
  })

  it('erro na leitura do cache: rejeita sem upsert', async () => {
    const chamadas: string[] = []
    const svc = { from: () => ({ select: () => ({ in: async () => ({ data: null, error: { message: 'down' } }) }), upsert: async () => { chamadas.push('u'); return { error: null } } }) }
    await expect(aplicarCadastroNoturno(svc, [sug({})], { dirSaida: dir, log })).rejects.toThrow(/down/)
    expect(chamadas).toEqual([])
  })
})

describe('aplicarSeHabilitado', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'noturno-')) })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('variavel ausente -> nao toca no banco nem grava backup', async () => {
    const { svc, chamadas } = mockSvc()
    const r = await aplicarSeHabilitado({}, svc, [sug({})], { dirSaida: dir, log: () => {} })
    expect(r).toBeNull()
    expect(chamadas).toEqual([])
    expect(existsSync(join(dir, 'backup-antes-aplicar.csv'))).toBe(false)
  })

  it('variavel=1 -> aplica', async () => {
    const { svc, chamadas } = mockSvc()
    const r = await aplicarSeHabilitado({ GEOCODE_NOTURNO_APLICAR: '1' }, svc, [sug({})], { dirSaida: dir, log: () => {} })
    expect(r?.gravados).toEqual(['RUA A, 1'])
    expect(chamadas.filter(c => c.op === 'upsert')).toHaveLength(1)
  })
})

describe('noturno - chave sem o sufixo de CEP (regressao 01/10)', () => {
  const SEM_BRUTO = 'RUA ANTONIO CUNHA, 502 - FRIGORIFICO, ITAPERUNA - **'
  const CHAVE_NORM = 'RUA ANTONIO CUNHA, 502 - FRIGORIFICO, ITAPERUNA'
  const COM = 'RUA ANTONIO CUNHA, 502 - FRIGORIFICO, ITAPERUNA - ** - 28300000'

  it('sugestao com CEP grava na chave sem CEP', () => {
    expect(montarLoteNoturno([sug({ endereco: COM })], new Map()).gravar.map(g => g.endereco)).toEqual([CHAVE_NORM])
  })

  it.each([CHAVE_NORM, COM])('fonte protegida na linha %s bloqueia a sugestao com CEP', chaveProtegida => {
    const r = montarLoteNoturno([sug({ endereco: COM })], new Map([[chaveProtegida, linha({ endereco: chaveProtegida, fonte: 'verificacao_manual' })]]))
    expect(r.gravar).toEqual([])
    expect(r.pulados.map(p => p.motivo)).toEqual(['fonte_protegida'])
  })

  it('aplicar: le as duas chaves, faz backup da linha sem CEP e grava nela', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'noturno-cep-'))
    try {
      const { svc, chamadas } = mockSvc({ cache: [linha({ endereco: CHAVE_NORM, fonte: 'cnefe', motivo: null }), linha({ endereco: COM, fonte: 'cnefe', lat: -21, lng: -41, motivo: null })] })
      const r = await aplicarCadastroNoturno(svc, [sug({ endereco: COM })], { dirSaida: dir, log: () => {} })
      const lidos = chamadas.filter(c => c.op === 'select').flatMap(c => c.arg as string[])
      expect(lidos.sort()).toEqual([COM, CHAVE_NORM].sort())
      expect(r.gravados).toEqual([CHAVE_NORM])
      expect(readFileSync(join(dir, 'backup-antes-aplicar.csv'), 'utf-8').split('\n')[1]).toBe(`${CHAVE_NORM};-22.6;-43.2;false;cnefe;`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

