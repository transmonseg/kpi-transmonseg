import { describe, expect, it } from 'vitest'
import { createHmac } from 'node:crypto'
import { assinarPasse } from './passe-central'

describe('assinarPasse', () => {
  it('formato que o monitoramento confere: corpo {e,x,j} + hmac de "entrar-central:<corpo>"', () => {
    const p = assinarPasse('Erica@X.com', 'seg', 1000)
    const [corpo, sig] = p.split('.')
    const d = JSON.parse(Buffer.from(corpo, 'base64url').toString())
    expect(d).toMatchObject({ e: 'erica@x.com', x: 1060 })
    expect(d.j).toMatch(/^[0-9a-f-]{36}$/)
    expect(sig).toBe(createHmac('sha256', 'seg').update(`entrar-central:${corpo}`).digest('base64url'))
  })
  it('cada passe tem id proprio (vale uma vez no monitoramento)', () => {
    expect(assinarPasse('a@x.com', 'seg', 1000)).not.toBe(assinarPasse('a@x.com', 'seg', 1000))
  })
})
