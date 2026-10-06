import { createBrowserClient } from '@supabase/ssr'
import { nomeCookieSessao } from './url'

// Central Transmonseg (05/10): o painel roda em central.transmonseg.com.br e
// em kpi.transmonseg.com.br, e os dois servem /rest/v1, /auth/v1 e
// /storage/v1. O navegador fala com o PRÓPRIO endereço (o GoTrue não libera
// CORS pra outro host) e o cookie de sessão mantém o nome de sempre.
export function createClient() {
  const url = typeof window !== 'undefined' ? window.location.origin : process.env.NEXT_PUBLIC_SUPABASE_URL!
  return createBrowserClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: { name: nomeCookieSessao() },
  })
}
