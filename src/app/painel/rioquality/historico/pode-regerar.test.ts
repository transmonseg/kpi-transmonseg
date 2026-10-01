import { describe, it, expect } from 'vitest'
import { podeRegerar } from './pode-regerar'

// Item 6 (01/10): o formato de arquivo unico (com cidade, inclusive o de 55
// colunas) so' guarda o romaneio (escala_storage_path fica null) -- o botao
// exigia os dois e sumia. A rota ja' regera do arquivo unico salvo.
describe('podeRegerar', () => {
  it('arquivo unico salvo (so romaneio): pode', () => {
    expect(podeRegerar({ escala_storage_path: null, romaneio_storage_path: 'rq/2026-09-30-completo.xlsx' })).toBe(true)
  })
  it('formato antigo (Custos + Entregas): pode', () => {
    expect(podeRegerar({ escala_storage_path: 'rq/c.xlsx', romaneio_storage_path: 'rq/e.xlsx' })).toBe(true)
  })
  it('sem planilha original guardada: nao pode', () => {
    expect(podeRegerar({ escala_storage_path: null, romaneio_storage_path: null })).toBe(false)
    expect(podeRegerar({ escala_storage_path: 'rq/c.xlsx', romaneio_storage_path: null })).toBe(false)
  })
})
