// src/lib/fusion/client.ts
import { loginFusion, invalidarSessaoFusion } from './auth'
const BASE = () => process.env.FUSION_BASE ?? 'https://fusiondms.com.br'

function pareceLogin(texto: string): boolean {
  return /id="login"|name="senha"|login\.html/i.test(texto) && !texto.trimStart().startsWith('{') && !texto.trimStart().startsWith('[')
}

interface Resposta { texto: string; morta: boolean }

async function chamar(path: string, init: RequestInit): Promise<Resposta> {
  const sess = await loginFusion()
  const res = await fetch(`${BASE()}${path}`, {
    ...init,
    redirect: 'manual',
    headers: {
      ...(init.headers ?? {}),
      'x-requested-with': 'XMLHttpRequest',
      cookie: `PHPSESSID=${sess}`,
    },
  })
  const texto = await res.text()
  const redirectLogin = res.status >= 300 && res.status < 400 && /login/i.test(res.headers.get('location') ?? '')
  return { texto, morta: redirectLogin || pareceLogin(texto) }
}

async function comRetry<T>(path: string, init: RequestInit): Promise<T> {
  let r = await chamar(path, init)
  if (r.morta) {
    invalidarSessaoFusion()
    r = await chamar(path, init)
    if (r.morta) throw new Error(`Fusion: sessão inválida após re-login em ${path}`)
  }
  const texto = r.texto
  try { return JSON.parse(texto) as T } catch { throw new Error(`Fusion: resposta não-JSON em ${path}`) }
}

export function fusionPost<T>(path: string, body: Record<string, string> = {}): Promise<T> {
  return comRetry<T>(path, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: new URLSearchParams(body).toString(),
  })
}

export function fusionGet<T>(path: string, query: Record<string, string> = {}): Promise<T> {
  const qs = new URLSearchParams(query).toString()
  return comRetry<T>(qs ? `${path}?${qs}` : path, { method: 'GET' })
}
