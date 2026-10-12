// src/lib/fusion/auth.ts
// Login na Fusion DMS. A Fusion fica atrás de um ALB da AWS com stickiness por
// cookie (AWSALB*): a sessão PHP (PHPSESSID) só é reconhecida no backend certo
// se os cookies AWSALB* viajarem junto. Por isso guardamos um JAR com TODOS os
// cookies, não só o PHPSESSID — mandar só o PHPSESSID cai noutro backend e a
// sessão aparece deslogada (500 / perfil vazio).
import { fusionFetch } from './http'
const BASE = () => process.env.FUSION_BASE ?? 'https://fusiondms.com.br'

let jar: Record<string, string> = {}

export function invalidarSessaoFusion() { jar = {} }

export function sessaoAtivaFusion(): boolean { return !!jar.PHPSESSID }

export function cookieHeaderFusion(): string {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ')
}

/** Absorve os Set-Cookie de uma resposta no jar (undici expõe getSetCookie();
 *  o fetch padrão junta em get('set-cookie')). AWSALB* rotaciona, então toda
 *  resposta pode atualizar o jar. */
export function absorveCookiesFusion(res: Response) {
  const h = res.headers as Headers & { getSetCookie?: () => string[] }
  const arr = h.getSetCookie?.() ?? (res.headers.get('set-cookie') ? [res.headers.get('set-cookie') as string] : [])
  for (const c of arr) {
    const m = c.match(/^\s*([^=]+)=([^;]+)/)
    if (m) jar[m[1].trim()] = m[2]
  }
}

/** Faz login (POST php/util/login.php, campos user_login/user_pass +
 *  cc_login_modulo '4' = Route Plan / Smart Tracking). Popula o jar e devolve o
 *  cookie header pronto. Lança se as credenciais forem recusadas. */
export async function loginFusion(): Promise<string> {
  if (jar.PHPSESSID) return cookieHeaderFusion()
  const user = process.env.FUSION_USER, pass = process.env.FUSION_PASS
  if (!user || !pass) throw new Error('FUSION_USER/FUSION_PASS ausentes')
  const res = await fusionFetch(`${BASE()}/php/util/login.php`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest' },
    body: new URLSearchParams({ user_login: user, user_pass: pass, cc_login_modulo: '4' }).toString(),
  })
  absorveCookiesFusion(res)
  const txt = await res.text().catch(() => '')
  let ok = false
  try { ok = JSON.parse(txt)?.success === true } catch { ok = /"success"\s*:\s*true/.test(txt) }
  if (!ok || !jar.PHPSESSID) {
    invalidarSessaoFusion()
    throw new Error('Login Fusion: credenciais recusadas ou sessão não estabelecida')
  }
  return cookieHeaderFusion()
}
