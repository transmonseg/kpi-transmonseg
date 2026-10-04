// Lentidao do painel (04/10/2026): o servidor Next falava com o proprio
// Supabase pela URL publica (HTTPS + Caddy, ~90 ms/chamada). Do lado do
// SERVIDOR usa o atalho interno (SUPABASE_INTERNAL_URL, ~10 ms) quando
// existir; o navegador continua na URL publica.
export function urlSupabaseServidor(): string {
  return process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!
}

// O nome do cookie de sessao do @supabase/ssr sai do HOST da URL
// (sb-<primeiro pedaco>-auth-token). Com a URL interna (127.0.0.1) mudaria e
// todo mundo cairia deslogado -- fixa o nome derivado da URL PUBLICA.
export function nomeCookieSessao(): string {
  return `sb-${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0]}-auth-token`
}
