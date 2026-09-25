import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mesclarParadas, lerSnapshotParadas, salvarSnapshotParadas, paradasEfetivas } from './paradas-snapshot'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  select: vi.fn(),
}))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => {
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.eq = () => q
    q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(mocks.select()).then(resolve)
    q.upsert = mocks.upsert
    return { from: () => q }
  },
}))

const parada = (o: Partial<UnitracParadaRow> = {}): UnitracParadaRow => ({
  id: 'p1',
  placa_norm: 'TTL7D40',
  chegada: '2026-09-22T06:00:00.000Z',
  saida: '2026-09-22T06:30:00.000Z',
  fim_real: '2026-09-22T06:30:00.000Z',
  duracao_seg: 1800,
  local_parada: 'BASE - BASE GARAGEM',
  codigo_loja: null,
  nome_loja: null,
  lat: -22.816007,
  lng: -43.277827,
  endereco: null,
  classificacao: 'BASE',
  ordem: 1,
  ...o,
})

describe('mesclarParadas', () => {
  it('une sem duplicar (mesma chegada + lat/lng arredondado a 5 casas)', () => {
    const a = [parada({ id: 'a1' })]
    const b = [parada({ id: 'a1-de-novo', lat: -22.8160071, lng: -43.2778269 })] // arredonda igual
    const r = mesclarParadas(a, b)
    expect(r).toHaveLength(1)
  })

  it('paradas com chegada ou coordenada diferente nao se fundem', () => {
    const a = [parada({ id: 'a1' })]
    const b = [parada({ id: 'a2', chegada: '2026-09-22T09:00:00.000Z' })]
    const r = mesclarParadas(a, b)
    expect(r).toHaveLength(2)
  })

  it('ordena por chegada', () => {
    const a = [parada({ id: 'tarde', chegada: '2026-09-22T09:00:00.000Z' })]
    const b = [parada({ id: 'cedo', chegada: '2026-09-22T05:00:00.000Z' })]
    const r = mesclarParadas(a, b)
    expect(r.map(p => p.id)).toEqual(['cedo', 'tarde'])
  })

  it('snapshot maior que a API (dia antigo) prevalece -- API nao apaga o que ja foi visto', () => {
    const snapshotGrande = [
      parada({ id: 's1', chegada: '2026-09-22T05:00:00.000Z' }),
      parada({ id: 's2', chegada: '2026-09-22T06:00:00.000Z', lat: -22.90, lng: -43.20 }),
      parada({ id: 's3', chegada: '2026-09-22T07:00:00.000Z', lat: -22.95, lng: -43.25 }),
    ]
    const apiIncompleta = [parada({ id: 'a1', chegada: '2026-09-22T05:00:00.000Z' })]
    const r = mesclarParadas(snapshotGrande, apiIncompleta)
    expect(r).toHaveLength(3)
  })

  // Fix round 1 (revisão): a chave antiga usava `chegada` exata -- numa
  // captura posterior o 1º evento cru do cluster pode ter saído da janela de
  // 48h da Unitrac, então a MESMA parada física reaparece com uma `chegada`
  // mais tardia (o cluster "perdeu a cabeça"). Duas entradas cujas janelas
  // [chegada, saída] se sobrepõem e cujos centros estão a ≤50m são a mesma
  // parada -- ao mesclar, o resultado é a UNIÃO das janelas (não a mais
  // recente, não a mais antiga: a mais longa).
  it('mesma parada fisica com chegada mais tardia (cluster perdeu a cabeca na janela de 48h) -- funde pela sobreposicao de janela + distancia, nao pela chegada exata', () => {
    const antiga = parada({
      id: 'antiga', chegada: '2026-09-22T05:00:00.000Z', saida: '2026-09-22T07:00:00.000Z', fim_real: '2026-09-22T07:00:00.000Z',
      lat: -22.816007, lng: -43.277827,
    })
    // mesmo lugar (~poucos metros), janela sobreposta, mas `chegada` mudou
    // porque o evento das 05:00 saiu da janela de 48h na nova captura.
    const nova = parada({
      id: 'nova', chegada: '2026-09-22T06:00:00.000Z', saida: '2026-09-22T07:30:00.000Z', fim_real: '2026-09-22T07:30:00.000Z',
      lat: -22.816050, lng: -43.277860, // ~7m de distancia
    })
    const r = mesclarParadas([antiga], [nova])
    expect(r).toHaveLength(1)
    expect(r[0].chegada).toBe('2026-09-22T05:00:00.000Z') // mantem o inicio mais antigo (antiga)
    expect(r[0].fim_real).toBe('2026-09-22T07:30:00.000Z') // e o fim mais tardio (nova) -- uniao das janelas
  })

  it('janelas que NAO se sobrepoem (mesmo perto) continuam separadas', () => {
    const a = parada({ id: 'a', chegada: '2026-09-22T05:00:00.000Z', saida: '2026-09-22T05:10:00.000Z', fim_real: '2026-09-22T05:10:00.000Z' })
    const b = parada({ id: 'b', chegada: '2026-09-22T08:00:00.000Z', saida: '2026-09-22T08:10:00.000Z', fim_real: '2026-09-22T08:10:00.000Z' })
    const r = mesclarParadas([a], [b])
    expect(r).toHaveLength(2)
  })

  it('janelas sobrepostas mas centros a mais de 50m continuam separadas', () => {
    const a = parada({ id: 'a', chegada: '2026-09-22T05:00:00.000Z', saida: '2026-09-22T07:00:00.000Z', fim_real: '2026-09-22T07:00:00.000Z', lat: -22.816007, lng: -43.277827 })
    const b = parada({ id: 'b', chegada: '2026-09-22T06:00:00.000Z', saida: '2026-09-22T07:30:00.000Z', fim_real: '2026-09-22T07:30:00.000Z', lat: -22.8170, lng: -43.2790 }) // ~150m
    const r = mesclarParadas([a], [b])
    expect(r).toHaveLength(2)
  })
})

describe('lerSnapshotParadas / salvarSnapshotParadas', () => {
  beforeEach(() => {
    mocks.upsert.mockClear()
    mocks.select.mockClear()
    mocks.upsert.mockResolvedValue({ error: null })
    mocks.select.mockResolvedValue({ data: [], error: null })
  })

  it('lerSnapshotParadas monta Map<placa, paradas> a partir das linhas', async () => {
    mocks.select.mockResolvedValue({
      data: [
        { placa: 'TTL7D40', paradas: [parada({ id: 'x1' })] },
        { placa: 'RQV6I51', paradas: [parada({ id: 'x2', placa_norm: 'RQV6I51' })] },
      ],
      error: null,
    })
    const m = await lerSnapshotParadas('nutrimax', '2026-09-22')
    expect(m.get('TTL7D40')).toHaveLength(1)
    expect(m.get('RQV6I51')?.[0].id).toBe('x2')
  })

  it('lerSnapshotParadas com erro do Supabase lanca', async () => {
    mocks.select.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(lerSnapshotParadas('nutrimax', '2026-09-22')).rejects.toThrow('boom')
  })

  it('salvarSnapshotParadas mescla com o que ja existe (upsert nunca encolhe)', async () => {
    mocks.select.mockResolvedValue({
      data: [{ placa: 'TTL7D40', paradas: [parada({ id: 'antiga' })] }],
      error: null,
    })
    await salvarSnapshotParadas('nutrimax', '2026-09-22', new Map([
      ['TTL7D40', [parada({ id: 'nova', chegada: '2026-09-22T09:00:00.000Z' })]],
    ]))
    expect(mocks.upsert).toHaveBeenCalledTimes(1)
    const linhas = mocks.upsert.mock.calls[0][0] as Array<{ placa: string; paradas: UnitracParadaRow[] }>
    expect(linhas).toHaveLength(1)
    expect(linhas[0].placa).toBe('TTL7D40')
    expect(linhas[0].paradas.map(p => p.id).sort()).toEqual(['antiga', 'nova'])
  })

  it('salvarSnapshotParadas sem placas nao chama upsert', async () => {
    await salvarSnapshotParadas('nutrimax', '2026-09-22', new Map())
    expect(mocks.upsert).not.toHaveBeenCalled()
  })
})

describe('paradasEfetivas', () => {
  beforeEach(() => {
    mocks.upsert.mockClear()
    mocks.select.mockClear()
    mocks.upsert.mockResolvedValue({ error: null })
    mocks.select.mockResolvedValue({ data: [], error: null })
  })

  it('hoje: salva a API no snapshot e devolve a API', async () => {
    const daApi = new Map([['TTL7D40', [parada({ id: 'hoje1' })]]])
    const r = await paradasEfetivas('nutrimax', '2026-09-24', '2026-09-24', daApi)
    expect(mocks.upsert).toHaveBeenCalledTimes(1)
    expect(r.get('TTL7D40')).toEqual(daApi.get('TTL7D40'))
  })

  it('dia passado: mescla API + snapshot (snapshot maior prevalece)', async () => {
    mocks.select.mockResolvedValue({
      data: [{ placa: 'TTL7D40', paradas: [
        parada({ id: 's1', chegada: '2026-09-22T05:00:00.000Z' }),
        parada({ id: 's2', chegada: '2026-09-22T06:00:00.000Z', lat: -22.90, lng: -43.20 }),
      ] }],
      error: null,
    })
    const daApi = new Map([['TTL7D40', [parada({ id: 'a1', chegada: '2026-09-22T05:00:00.000Z' })]]])
    const r = await paradasEfetivas('nutrimax', '2026-09-22', '2026-09-24', daApi)
    expect(r.get('TTL7D40')).toHaveLength(2)
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it('falha de leitura do snapshot nao quebra: loga e devolve a API', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.select.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const daApi = new Map([['TTL7D40', [parada({ id: 'a1' })]]])
    const r = await paradasEfetivas('nutrimax', '2026-09-22', '2026-09-24', daApi)
    expect(r).toEqual(daApi)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('dia passado sem snapshot pra essa placa: devolve a API dela', async () => {
    mocks.select.mockResolvedValue({ data: [], error: null })
    const daApi = new Map([['TTL7D40', [parada({ id: 'a1' })]]])
    const r = await paradasEfetivas('nutrimax', '2026-09-22', '2026-09-24', daApi)
    expect(r.get('TTL7D40')).toEqual(daApi.get('TTL7D40'))
  })
})
