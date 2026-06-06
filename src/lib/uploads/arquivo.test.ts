import { describe, expect, it } from 'vitest'
import { extensaoUploadSuportada } from './arquivo'

describe('extensaoUploadSuportada', () => {
  it('aceita pdf e xlsx ignorando caixa', () => {
    expect(extensaoUploadSuportada('escala.PDF')).toBe('pdf')
    expect(extensaoUploadSuportada('unitrac.xlsx')).toBe('xlsx')
  })

  it('rejeita extensoes diferentes de pdf e xlsx', () => {
    expect(extensaoUploadSuportada('arquivo.csv')).toBeNull()
    expect(extensaoUploadSuportada('arquivo.exe')).toBeNull()
    expect(extensaoUploadSuportada('sem-extensao')).toBeNull()
  })
})
