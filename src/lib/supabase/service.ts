import { createClient } from '@supabase/supabase-js'

/** Erro tipado pro app desktop: telas da nuvem que dependem da service key (não
 *  embutida no .exe por segurança). O error boundary do /painel mostra um aviso. */
export const ERRO_SERVICE_KEY_DESKTOP = 'SERVICE_KEY_AUSENTE_DESKTOP'

export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  // No app desktop, a service key NÃO é embutida (segurança). As telas que a usam
  // (dashboard/histórico/lojas) avisam em vez de quebrar com "supabaseKey is required".
  // No site (Vercel) DESKTOP_APP não está setado → comportamento idêntico ao de antes.
  if (!key && process.env.DESKTOP_APP === '1') {
    throw new Error(ERRO_SERVICE_KEY_DESKTOP)
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key!,
    { auth: { persistSession: false } }
  )
}
