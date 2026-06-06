import { describe, expect, it, vi } from 'vitest'
import { deleteEntradasManualMes, replaceEntradasManualMes, ultimoDiaDoMes } from './manual-import'

describe('manual-import', () => {
  it('calcula o ultimo dia real do mes', () => {
    expect(ultimoDiaDoMes('2026-02')).toBe('2026-02-28')
    expect(ultimoDiaDoMes('2024-02')).toBe('2024-02-29')
    expect(ultimoDiaDoMes('2026-04')).toBe('2026-04-30')
    expect(ultimoDiaDoMes('2026-05')).toBe('2026-05-31')
  })

  it('aborta quando o delete mensal retorna erro do Supabase', async () => {
    const lte = vi.fn().mockResolvedValue({ error: { message: 'invalid date' } })
    const gte = vi.fn(() => ({ lte }))
    const eq = vi.fn(() => ({ gte }))
    const deleteFn = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ delete: deleteFn }))
    const svc = { from }

    await expect(deleteEntradasManualMes(svc, 'REDE', '2026-02')).rejects.toThrow(
      'Erro ao limpar KPI manual do mês: invalid date',
    )

    expect(from).toHaveBeenCalledWith('kpi_manual_entradas')
    expect(eq).toHaveBeenCalledWith('rede_id', 'REDE')
    expect(gte).toHaveBeenCalledWith('data', '2026-02-01')
    expect(lte).toHaveBeenCalledWith('data', '2026-02-28')
  })

  it('envia a importacao mensal para a RPC transacional', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    const svc = { rpc }
    const entradas = [{
      rede_id: 'REDE',
      data: '2026-02-01',
      loja: 'Loja 1',
      placa: 'ABC1234',
      motorista: 'Motorista',
      status: 'entregue' as const,
      saida_cd: '06:00',
      chd: '07:00',
      sai: '07:20',
      volta_base: null,
    }]

    await replaceEntradasManualMes(svc, 'REDE', '2026-02', entradas, 'user-1')

    expect(rpc).toHaveBeenCalledWith('replace_kpi_manual_mes', {
      p_rede_id: 'REDE',
      p_mes: '2026-02',
      p_entradas: entradas,
      p_uploaded_by: 'user-1',
    })
  })

  it('aborta quando a RPC transacional retorna erro', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { message: 'function missing' } })
    const svc = { rpc }

    await expect(replaceEntradasManualMes(svc, 'REDE', '2026-02', [], 'user-1')).rejects.toThrow(
      'Erro ao importar KPI manual do mês: function missing',
    )
  })
})
