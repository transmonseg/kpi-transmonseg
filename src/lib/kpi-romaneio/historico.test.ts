import { describe, it, expect, vi, beforeEach } from 'vitest'
import { salvarGeracao, buscarGeracaoParaRegenerar } from './historico'

// Mock do módulo de Supabase service
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(),
}))

import { createServiceClient } from '@/lib/supabase/service'

describe('salvarGeracao', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('insere registro com sucesso e devolve o id gerado', async () => {
    const mockSingle = vi.fn().mockResolvedValue({ data: { id: 'geracao-1' }, error: null })
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelect })
    const mockFrom = vi.fn().mockReturnValue({ insert: mockInsert })
    const mockClient = { from: mockFrom }

    vi.mocked(createServiceClient).mockReturnValue(mockClient as any)

    const id = await salvarGeracao({
      cliente: 'nutrimax',
      dataReferencia: '2026-08-23',
      geradoPor: 'user@example.com',
      qtdCargas: 10,
      arquivoStoragePath: null,
      escalaStoragePath: 'nutrimax/2026-08-23/abc/escala.pdf',
      romaneioStoragePath: 'nutrimax/2026-08-23/abc/romaneio.pdf',
    })

    expect(id).toBe('geracao-1')
    expect(mockFrom).toHaveBeenCalledWith('kpi_romaneio_geracoes')
    expect(mockInsert).toHaveBeenCalledWith({
      cliente: 'nutrimax',
      data_referencia: '2026-08-23',
      gerado_por: 'user@example.com',
      qtd_cargas: 10,
      arquivo_storage_path: null,
      escala_storage_path: 'nutrimax/2026-08-23/abc/escala.pdf',
      romaneio_storage_path: 'nutrimax/2026-08-23/abc/romaneio.pdf',
    })
  })

  it('lança erro quando inserção falha', async () => {
    const mockError = { message: 'Database error' }
    const mockSingle = vi.fn().mockResolvedValue({ data: null, error: mockError })
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelect })
    const mockFrom = vi.fn().mockReturnValue({ insert: mockInsert })
    const mockClient = { from: mockFrom }

    vi.mocked(createServiceClient).mockReturnValue(mockClient as any)

    await expect(
      salvarGeracao({
        cliente: 'nutrimax',
        dataReferencia: '2026-08-23',
        geradoPor: 'user@example.com',
        qtdCargas: 10,
        arquivoStoragePath: null,
        escalaStoragePath: null,
        romaneioStoragePath: null,
      }),
    ).rejects.toThrow('Falha ao salvar geracao: Database error')
  })

  it('aceita null pra geradoPor e pros 3 caminhos de storage', async () => {
    const mockSingle = vi.fn().mockResolvedValue({ data: { id: 'geracao-2' }, error: null })
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelect })
    const mockFrom = vi.fn().mockReturnValue({ insert: mockInsert })
    const mockClient = { from: mockFrom }

    vi.mocked(createServiceClient).mockReturnValue(mockClient as any)

    await salvarGeracao({
      cliente: 'nutrimax',
      dataReferencia: '2026-08-23',
      geradoPor: null,
      qtdCargas: 5,
      arquivoStoragePath: null,
      escalaStoragePath: null,
      romaneioStoragePath: null,
    })

    expect(mockInsert).toHaveBeenCalledWith({
      cliente: 'nutrimax',
      data_referencia: '2026-08-23',
      gerado_por: null,
      qtd_cargas: 5,
      arquivo_storage_path: null,
      escala_storage_path: null,
      romaneio_storage_path: null,
    })
  })
})

describe('buscarGeracaoParaRegenerar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('devolve os dados minimos pra regenerar quando o id existe e tem os PDFs guardados', async () => {
    const mockMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'geracao-1',
        data_referencia: '2026-08-23',
        escala_storage_path: 'nutrimax/2026-08-23/abc/escala.pdf',
        romaneio_storage_path: 'nutrimax/2026-08-23/abc/romaneio.pdf',
      },
      error: null,
    })
    const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    const mockFrom = vi.fn().mockReturnValue({ select: mockSelect })
    vi.mocked(createServiceClient).mockReturnValue({ from: mockFrom } as any)

    const r = await buscarGeracaoParaRegenerar('geracao-1')

    expect(r).toEqual({
      id: 'geracao-1',
      dataReferencia: '2026-08-23',
      escalaStoragePath: 'nutrimax/2026-08-23/abc/escala.pdf',
      romaneioStoragePath: 'nutrimax/2026-08-23/abc/romaneio.pdf',
    })
  })

  it('devolve null quando o id nao existe', async () => {
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    const mockFrom = vi.fn().mockReturnValue({ select: mockSelect })
    vi.mocked(createServiceClient).mockReturnValue({ from: mockFrom } as any)

    expect(await buscarGeracaoParaRegenerar('nao-existe')).toBeNull()
  })

  it('devolve os campos null pra geracao antiga sem os PDFs guardados (antes desta mudanca)', async () => {
    const mockMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: 'geracao-antiga', data_referencia: '2026-08-10', escala_storage_path: null, romaneio_storage_path: null },
      error: null,
    })
    const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    const mockFrom = vi.fn().mockReturnValue({ select: mockSelect })
    vi.mocked(createServiceClient).mockReturnValue({ from: mockFrom } as any)

    const r = await buscarGeracaoParaRegenerar('geracao-antiga')
    expect(r?.escalaStoragePath).toBeNull()
    expect(r?.romaneioStoragePath).toBeNull()
  })
})
