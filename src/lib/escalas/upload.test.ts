import { describe, expect, it, vi } from 'vitest'
import { deleteEscalaUploadExistente } from './upload'

describe('deleteEscalaUploadExistente', () => {
  it('aborta quando o delete do upload antigo falha', async () => {
    const eqId = vi.fn().mockResolvedValue({ error: { message: 'fk violation' } })
    const deleteFn = vi.fn(() => ({ eq: eqId }))
    const from = vi.fn(() => ({ delete: deleteFn }))

    await expect(deleteEscalaUploadExistente({ from }, 'upload-1')).rejects.toThrow(
      'Erro ao remover escala anterior: fk violation',
    )

    expect(from).toHaveBeenCalledWith('escala_uploads')
    expect(eqId).toHaveBeenCalledWith('id', 'upload-1')
  })
})
