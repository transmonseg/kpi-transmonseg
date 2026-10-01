import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/unitrac-api/client', () => ({ apiGet: vi.fn() }))

import { apiGet } from '@/lib/unitrac-api/client'
import { buscarStopsCruOuErro } from './unitrac'
import { buscarRastroOuErro } from './km-rastro'

// Task 1 (plano 2026-09-30): apiGet devolve null em erro/timeout/status != 200
// e buscarStopsCru (compartilhado) transforma isso em [] -- indistinguivel de
// "placa sem posicao". Aqui erro LANCA; 200 vazio devolve [].
describe('buscarStopsCruOuErro', () => {
  beforeEach(() => vi.clearAllMocks())

  it('erro/timeout (apiGet null) lanca', async () => {
    vi.mocked(apiGet).mockResolvedValue(null)
    await expect(buscarStopsCruOuErro('123', 48)).rejects.toThrow(/stops/)
  })

  it('200 sem paradas devolve []', async () => {
    vi.mocked(apiGet).mockResolvedValue({ paradas: [] })
    await expect(buscarStopsCruOuErro('123', 48)).resolves.toEqual([])
  })

  it('200 com corpo sem `paradas` array (objeto de erro) lanca, nao vira lista vazia', async () => {
    vi.mocked(apiGet).mockResolvedValue({ erro: 'token expirado' })
    await expect(buscarStopsCruOuErro('123', 48)).rejects.toThrow(/stops/)
    vi.mocked(apiGet).mockResolvedValue({ paradas: { msg: 'x' } })
    await expect(buscarStopsCruOuErro('123', 48)).rejects.toThrow(/stops/)
  })

  it('200 com paradas filtra coordenada invalida (mesmo filtro de buscarStopsCru)', async () => {
    vi.mocked(apiGet).mockResolvedValue({ paradas: [
      { _data: '2026-09-29T10:00:00', tempoparada: 5, latitude: -22.9, longitude: -43.2 },
      { _data: '2026-09-29T11:00:00', tempoparada: 5, latitude: 0, longitude: 0 },
    ] })
    const r = await buscarStopsCruOuErro('123', 48)
    expect(r).toHaveLength(1)
    expect(apiGet).toHaveBeenCalledWith('/mapa_servicos/stops/123/48')
  })
})

// Revisao independente 30/09: 200 com corpo sem a chave esperada como array
// e' ERRO de consulta, nunca "rastro vazio" (viraria sem sinal falso).
describe('buscarRastroOuErro', () => {
  beforeEach(() => vi.clearAllMocks())

  it('200 com corpo objeto de erro (sem `posicoes` array) lanca', async () => {
    vi.mocked(apiGet).mockResolvedValue({ erro: 'token expirado' })
    await expect(buscarRastroOuErro('123', 24)).rejects.toThrow(/rastro/)
    vi.mocked(apiGet).mockResolvedValue({ posicoes: null })
    await expect(buscarRastroOuErro('123', 24)).rejects.toThrow(/rastro/)
  })

  it('200 com posicoes [] devolve []', async () => {
    vi.mocked(apiGet).mockResolvedValue({ posicoes: [] })
    await expect(buscarRastroOuErro('123', 24)).resolves.toEqual([])
  })
})
