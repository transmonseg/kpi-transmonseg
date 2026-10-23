// Teste a seco (F0-07, plano mestre 23/10): regera um dia sem gravar nada no
// Supabase. A trava fica no fetch global -- cobre todos os caminhos de escrita
// (cache de geocode, cache negativo, cache do dia, storage) sem mexer neles.

/** true = escrita no Supabase (REST ou storage) que o teste a seco descarta.
 *  RPC passa: sao funcoes de consulta (cnefe, distancia ao bairro). */
export function escritaBloqueada(url: string, metodo: string, baseSupabase: string): boolean {
  const m = metodo.toUpperCase()
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return false
  if (!url.startsWith(baseSupabase)) return false
  if (url.includes('/rest/v1/rpc/')) return false
  return url.includes('/rest/v1/') || url.includes('/storage/v1/')
}

/** Troca o fetch global por um que descarta as escritas do Supabase e conta
 *  quantas foram descartadas (por tabela/caminho). */
export function instalarTravaDeEscrita(baseSupabase: string): Map<string, number> {
  const descartadas = new Map<string, number>()
  const original = globalThis.fetch
  globalThis.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url
    const metodo = init?.method ?? (entrada instanceof Request ? entrada.method : 'GET')
    if (escritaBloqueada(url, metodo, baseSupabase)) {
      const chave = url.slice(baseSupabase.length).split('?')[0]
      descartadas.set(chave, (descartadas.get(chave) ?? 0) + 1)
      return new Response('[]', { status: 201, headers: { 'content-type': 'application/json' } })
    }
    return original(entrada, init)
  }) as typeof fetch
  return descartadas
}
