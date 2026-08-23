import { describe, it, expect, vi, beforeEach } from 'vitest'
import { salvarGeracao } from './historico'

// Mock do módulo de Supabase service
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(),
}))

import { createServiceClient } from '@/lib/supabase/service'

describe('salvarGeracao', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('insere registro com sucesso', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null })
    const mockFrom = vi.fn().mockReturnValue({
      insert: mockInsert,
    })
    const mockClient = {
      from: mockFrom,
    }

    vi.mocked(createServiceClient).mockReturnValue(mockClient as any)

    await salvarGeracao({
      cliente: 'nutrimax',
      dataReferencia: '2026-08-23',
      geradoPor: 'user@example.com',
      qtdCargas: 10,
      arquivoStoragePath: null,
    })

    expect(mockFrom).toHaveBeenCalledWith('kpi_romaneio_geracoes')
    expect(mockInsert).toHaveBeenCalledWith({
      cliente: 'nutrimax',
      data_referencia: '2026-08-23',
      gerado_por: 'user@example.com',
      qtd_cargas: 10,
      arquivo_storage_path: null,
    })
  })

  it('lança erro quando inserção falha', async () => {
    const mockError = { message: 'Database error' }
    const mockInsert = vi.fn().mockResolvedValue({ error: mockError })
    const mockFrom = vi.fn().mockReturnValue({
      insert: mockInsert,
    })
    const mockClient = {
      from: mockFrom,
    }

    vi.mocked(createServiceClient).mockReturnValue(mockClient as any)

    await expect(
      salvarGeracao({
        cliente: 'nutrimax',
        dataReferencia: '2026-08-23',
        geradoPor: 'user@example.com',
        qtdCargas: 10,
        arquivoStoragePath: null,
      }),
    ).rejects.toThrow('Falha ao salvar geracao: Database error')
  })

  it('aceita null para geradoPor e arquivoStoragePath', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null })
    const mockFrom = vi.fn().mockReturnValue({
      insert: mockInsert,
    })
    const mockClient = {
      from: mockFrom,
    }

    vi.mocked(createServiceClient).mockReturnValue(mockClient as any)

    await salvarGeracao({
      cliente: 'nutrimax',
      dataReferencia: '2026-08-23',
      geradoPor: null,
      qtdCargas: 5,
      arquivoStoragePath: null,
    })

    expect(mockInsert).toHaveBeenCalledWith({
      cliente: 'nutrimax',
      data_referencia: '2026-08-23',
      gerado_por: null,
      qtd_cargas: 5,
      arquivo_storage_path: null,
    })
  })
})
