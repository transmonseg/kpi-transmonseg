// Cliente da ponte POST /api/romaneio/geocode-ancoras do projeto irmao
// "monitoramento" -- passo 7 do motor de geolocalizacao universal (docs/
// superpowers/specs/2026-09-05-motor-geolocalizacao-universal-design.md,
// projeto monitoramento): resgata endereco que a cascata PRECISA nao
// resolveu, usando como ancora as coordenadas de OUTRAS entregas do MESMO
// caminhao/dia que ja' resolveram. Mesmo padrao de bridge dos outros
// clientes deste diretorio: MONITORAMENTO_URL + x-motor-key (MOTOR_SECRET),
// timeout, falha GRACIOSA -- qualquer erro vira null pra todo mundo (nunca
// lanca, nunca bloqueia o resto do pipeline).

export type Ancora = { lat: number; lng: number }
export type GrupoAncoras = { id: string; ruas: string[]; ancoras: Ancora[] }
export type ResultadoAncora = { lat: number; lng: number } | null

const TIMEOUT_MS = 60_000

function url(): string {
  const base = process.env.MONITORAMENTO_URL ?? 'http://127.0.0.1:3010'
  return `${base}/api/romaneio/geocode-ancoras`
}

function tudoNull(grupos: GrupoAncoras[]): Map<string, ResultadoAncora[]> {
  return new Map(grupos.map(g => [g.id, g.ruas.map(() => null)]))
}

function validar(r: unknown): ResultadoAncora {
  if (typeof r !== 'object' || r === null) return null
  const o = r as Record<string, unknown>
  const lat = typeof o.lat === 'number' ? o.lat : null
  const lng = typeof o.lng === 'number' ? o.lng : null
  return lat !== null && lng !== null ? { lat, lng } : null
}

export async function reposicionarPorAncoras(grupos: GrupoAncoras[]): Promise<Map<string, ResultadoAncora[]>> {
  if (grupos.length === 0) return new Map()
  const chave = process.env.MOTOR_SECRET
  if (!chave) {
    console.error('[kpi-romaneio/geocode-ancoras] MOTOR_SECRET nao configurado')
    return tudoNull(grupos)
  }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(url(), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-motor-key': chave },
      body: JSON.stringify({ grupos }),
      signal: ctrl.signal,
    })
  } catch (e) {
    console.error('[kpi-romaneio/geocode-ancoras] chamada ao monitoramento falhou:', e instanceof Error ? e.message : String(e))
    return tudoNull(grupos)
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) {
    console.error(`[kpi-romaneio/geocode-ancoras] monitoramento respondeu ${res.status}`)
    return tudoNull(grupos)
  }
  let data: unknown
  try {
    data = await res.json()
  } catch (e) {
    console.error('[kpi-romaneio/geocode-ancoras] resposta nao e JSON valido:', e instanceof Error ? e.message : String(e))
    return tudoNull(grupos)
  }
  const brutos = (data as { grupos?: unknown })?.grupos
  if (!Array.isArray(brutos)) {
    console.error("[kpi-romaneio/geocode-ancoras] resposta sem campo 'grupos' valido")
    return tudoNull(grupos)
  }
  const porId = new Map<string, unknown[]>()
  for (const g of brutos as { id?: unknown; resultados?: unknown }[]) {
    if (typeof g?.id === 'string' && Array.isArray(g.resultados)) porId.set(g.id, g.resultados)
  }
  const saida = new Map<string, ResultadoAncora[]>()
  for (const g of grupos) {
    const r = porId.get(g.id)
    saida.set(g.id, r && r.length === g.ruas.length ? r.map(validar) : g.ruas.map(() => null))
  }
  return saida
}
