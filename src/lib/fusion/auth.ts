// src/lib/fusion/auth.ts
const BASE = () => process.env.FUSION_BASE ?? 'https://fusiondms.com.br'
let sessao: string | null = null

export function invalidarSessaoFusion() { sessao = null }

export async function loginFusion(): Promise<string> {
  if (sessao) return sessao
  const user = process.env.FUSION_USER, pass = process.env.FUSION_PASS
  if (!user || !pass) throw new Error('FUSION_USER/FUSION_PASS ausentes')
  const body = new URLSearchParams({ login: user, senha: pass, usuario: user, password: pass })
  const res = await fetch(`${BASE()}/login.html`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-requested-with': 'XMLHttpRequest' },
    body: body.toString(),
  })
  const cookie = res.headers.get('set-cookie') ?? ''
  const m = cookie.match(/PHPSESSID=([^;]+)/)
  if (!m) throw new Error('Login Fusion: PHPSESSID não retornado (sessão)')
  sessao = m[1]
  return sessao
}
