export const BASE = 'https://datalayer.portalunitrac.com'
export const COD_USER = '4586' // Benassi / conta transmonseg
export const COD_USER_NUTRIMAX = '4096' // Nutrimax / conta erica.rastreamento

const TIMEOUT_MS = 6000

async function call(url: string, init?: RequestInit): Promise<unknown | null> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const r = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { accept: 'application/json', 'content-type': 'application/json', ...(init?.headers ?? {}) },
    })
    if (r.status !== 200) return null
    return await r.json()
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

export function apiGet(path: string): Promise<unknown | null> {
  return call(`${BASE}${path}`)
}

export function apiPost(path: string, body: unknown): Promise<unknown | null> {
  return call(`${BASE}${path}`, { method: 'POST', body: JSON.stringify(body) })
}
