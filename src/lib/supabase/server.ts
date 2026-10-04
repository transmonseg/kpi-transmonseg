import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { urlSupabaseServidor, nomeCookieSessao } from './url'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    urlSupabaseServidor(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { name: nomeCookieSessao() },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // server components cannot set cookies — middleware handles refresh
          }
        },
      },
    }
  )
}
