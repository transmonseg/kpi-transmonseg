import { describe, expect, it } from 'vitest'
import { createHmac } from 'node:crypto'
import { assinarPasse } from './passe-central'

describe('assinarPasse', () => {
  it('formato que o monitoramento confere: corpo {e,x} + hmac de "entrar-central:<corpo>"', () => {
    const p = assinarPasse('Erica@X.com', 'seg', 1000)
    const [corpo, sig] = p.split('.')
    expect(JSON.parse(Buffer.from(corpo, 'base64url').toString())).toEqual({ e: 'erica@x.com', x: 1060 })
    expect(sig).toBe(createHmac('sha256', 'seg').update(`entrar-central:${corpo}`).digest('base64url'))
  })
})
