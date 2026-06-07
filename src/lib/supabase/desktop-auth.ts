import type { SupabaseClient, User } from '@supabase/supabase-js'

/**
 * Resolve o usuário autenticado tolerando o modo OFFLINE do app desktop.
 *
 * No site (web), comportamento IDÊNTICO ao de sempre: `getUser()` (valida o token
 * no servidor de auth). No app desktop (`DESKTOP_APP=1`), quando não há internet,
 * `getUser()` falha — então caímos para a SESSÃO LOCAL (`getSession()`, lê o cookie
 * sem ir à rede), pra não expulsar pro /login um operador que já tinha logado.
 *
 * É um no-op no site: quando `DESKTOP_APP` não está setado, só chama `getUser()`.
 */
export async function resolveUserDesktopAware(
  supabase: SupabaseClient,
): Promise<User | null> {
  if (process.env.DESKTOP_APP !== '1') {
    return (await supabase.auth.getUser()).data.user
  }
  // Desktop: tenta validar online; se falhar (offline), confia na sessão local.
  try {
    const { data, error } = await supabase.auth.getUser()
    if (!error && data.user) return data.user
  } catch {
    /* offline — cai pra sessão local abaixo */
  }
  try {
    return (await supabase.auth.getSession()).data.session?.user ?? null
  } catch {
    return null
  }
}
