import { createHash } from 'crypto'

const RAVEX_TOKEN_URL = 'https://sistema.ravex.com.br/Token'
// Margem de seguranca antes do expires_in real -- nunca usa um token
// que esta prestes a expirar no meio de uma geracao longa.
const MARGEM_SEGURANCA_MS = 5 * 60 * 1000

let tokenCache: { token: string; expiraEm: number } | null = null

function md5(texto: string): string {
  return createHash('md5').update(texto).digest('hex')
}

/** Devolve um Bearer token valido da Ravex, reusando o cache em memoria
 *  do processo enquanto nao expirar. Login falho (credencial invalida,
 *  conta bloqueada) lanca erro explicito -- autenticacao quebrada precisa
 *  aparecer, nunca virar "sem GPS" silencioso pra frota inteira. */
export async function obterTokenRavex(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiraEm) {
    return tokenCache.token
  }

  const usuario = process.env.RAVEX_USUARIO
  const senha = process.env.RAVEX_SENHA
  if (!usuario || !senha) {
    throw new Error('RAVEX_USUARIO/RAVEX_SENHA não configuradas')
  }

  const corpo = new URLSearchParams({
    grant_type: 'password',
    username: usuario,
    password: md5(senha),
  })

  const res = await fetch(RAVEX_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: corpo.toString(),
  })

  const data = await res.json().catch(() => null) as
    | { access_token: string; expires_in: number }
    | { error: string; error_description?: string }
    | null

  if (!res.ok || !data || !('access_token' in data)) {
    const msg = data && 'error_description' in data && data.error_description
      ? data.error_description
      : data && 'error' in data
        ? data.error
        : `login Ravex falhou (HTTP ${res.status})`
    throw new Error(`Falha ao autenticar na Ravex: ${msg}`)
  }

  tokenCache = {
    token: data.access_token,
    expiraEm: Date.now() + data.expires_in * 1000 - MARGEM_SEGURANCA_MS,
  }
  return tokenCache.token
}

/** Invalida o token em cache -- usar quando uma chamada autenticada
 *  devolve 401/403 depois de um login que tinha funcionado (token
 *  revogado/expirado no servidor antes do nosso relogio local achar
 *  que ele ainda era valido). Forca reautenticacao na proxima chamada. */
export function invalidarTokenRavex(): void {
  tokenCache = null
}
