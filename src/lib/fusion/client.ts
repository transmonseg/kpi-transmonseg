// src/lib/fusion/client.ts
import { loginFusion, invalidarSessaoFusion, cookieHeaderFusion, absorveCookiesFusion } from './auth'
import { fusionFetch } from './http'
const BASE = () => process.env.FUSION_BASE ?? 'https://fusiondms.com.br'

function pareceLogin(texto: string): boolean {
  const t = texto.trimStart()
  if (t.startsWith('{') || t.startsWith('[')) return false
  // Tela de login, ou o redirect de sessão morta que a Fusion devolve nos
  // endpoints internos: <script>document.location.href='../../index.html'</script>
  return /id="login"|name="senha"|login\.html|index\.html|document\.location/i.test(texto)
}

interface Resposta { texto: string; morta: boolean }

async function chamar(path: string, init: RequestInit): Promise<Resposta> {
  await loginFusion()
  const res = await fusionFetch(`${BASE()}${path}`, {
    ...init,
    redirect: 'manual',
    headers: {
      ...(init.headers ?? {}),
      'x-requested-with': 'XMLHttpRequest',
      cookie: cookieHeaderFusion(),
    },
  })
  absorveCookiesFusion(res)
  const redirectLogin = res.status >= 300 && res.status < 400 && /login|index/i.test(res.headers.get('location') ?? '')
  const texto = await res.text()
  // 500 com corpo vazio costuma ser sessão perdida no backend errado do ALB.
  const quebrou = res.status >= 500 && texto.length === 0
  return { texto, morta: redirectLogin || quebrou || pareceLogin(texto) }
}

async function comRetry<T>(path: string, init: RequestInit): Promise<T> {
  let r = await chamar(path, init)
  if (r.morta) {
    invalidarSessaoFusion()
    r = await chamar(path, init)
    if (r.morta) throw new Error(`Fusion: sessão inválida após re-login em ${path}`)
  }
  try { return JSON.parse(r.texto) as T } catch { throw new Error(`Fusion: resposta não-JSON em ${path}`) }
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

/** 12/11: arquivo binário (xlsx) de um relatório da Fusion. Sessão morta (a
 *  Fusion devolve a tela de login em HTML no lugar do arquivo) refaz o login
 *  uma vez. Lança se não vier um zip (xlsx). */
export async function fusionBaixar(path: string): Promise<Buffer> {
  const tentar = async (): Promise<{ buf: Buffer; morta: boolean }> => {
    await loginFusion()
    const res = await fusionFetch(`${BASE()}${path}`, { method: 'GET', redirect: 'manual', headers: { cookie: cookieHeaderFusion() } })
    absorveCookiesFusion(res)
    const buf = Buffer.from(await res.arrayBuffer())
    const ehZip = buf.subarray(0, 2).toString('latin1') === 'PK'
    const redirectLogin = res.status >= 300 && res.status < 400
    return { buf, morta: !ehZip && (redirectLogin || pareceLogin(buf.subarray(0, 4000).toString('utf8'))) }
  }
  let r = await tentar()
  if (r.morta) { invalidarSessaoFusion(); r = await tentar() }
  if (r.buf.subarray(0, 2).toString('latin1') !== 'PK') throw new Error(`Fusion: ${path.split('?')[0]} não devolveu planilha (${r.buf.length} bytes${r.morta ? ', sessão inválida' : ''})`)
  return r.buf
}
