import { describe, expect, it, vi, beforeEach } from 'vitest'

const est = vi.hoisted(() => ({ user: null as null | { id: string; email: string }, papel: 'operador' }))
vi.mock('@/lib/supabase/usuario-atual', () => ({ usuarioAtual: async () => est.user }))
vi.mock('@/lib/perfil', () => ({ getPerfil: async () => ({ papel: est.papel }) }))

import { GET } from './route'

describe('GET /api/monitoramento/passe', () => {
  beforeEach(() => { process.env.MOTOR_SECRET = 'seg'; est.user = { id: 'u1', email: 'Erica@x.com' }; est.papel = 'operador' })
  it('equipe (admin/operador) recebe um passe com o proprio email', async () => {
    const r = await GET()
    const { passe } = await r.json()
    expect(JSON.parse(Buffer.from(passe.split('.')[0], 'base64url').toString()).e).toBe('erica@x.com')
    expect(r.headers.get('cache-control')).toBe('no-store')
  })
  it('sem login: 401; login de cliente (gerente/visualizador): 403', async () => {
    est.user = null
    expect((await GET()).status).toBe(401)
    est.user = { id: 'u1', email: 'a@x.com' }; est.papel = 'gerente'
    expect((await GET()).status).toBe(403)
  })
})
