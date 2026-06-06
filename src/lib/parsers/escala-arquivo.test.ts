// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { parseEscalaArquivo } from './escala-arquivo'

const GERAL = 'C:/Users/media/Downloads/ESCALA GERAL DE JUNHO 1.xlsx'

describe('parseEscalaArquivo', () => {
  it('auto-detecta e parseia a ESCALA GERAL', async () => {
    if (!fs.existsSync(GERAL)) { console.log('arquivo ausente'); return }
    const linhas = await parseEscalaArquivo(fs.readFileSync(GERAL), 'ESCALA GERAL DE JUNHO 1.xlsx', '2026-06-06')
    expect(linhas.length).toBeGreaterThan(100)
    expect(linhas.some(l => /PREZUNIC|ASSAI|CARREFOUR|PRINCESA/i.test(l.rede_id))).toBe(true)
  }, 60000)

  it('arquivo lixo → [] (não lança)', async () => {
    const r = await parseEscalaArquivo(Buffer.from('não é escala'), 'lixo.xlsx', '2026-06-06')
    expect(r).toEqual([])
  })
})
