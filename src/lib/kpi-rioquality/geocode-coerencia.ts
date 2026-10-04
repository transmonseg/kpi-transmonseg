// Cliente da ponte POST /api/romaneio/geocode-coerencia do projeto irmao
// "monitoramento" -- geocodificacao por COERENCIA DE GRUPO pra romaneio que so'
// traz o nome da rua (caso Rio Quality). Mesmo padrao do kpi-romaneio/geocode.ts:
// MONITORAMENTO_URL + x-motor-key (MOTOR_SECRET), timeout, e falha GRACIOSA --
// qualquer erro vira "sem_candidato" pra todo mundo (o relatorio sai, marcado),
// nunca lanca.
//
// Diferenca importante em relacao a ponte simples: a resposta traz CONFIANCA
// por parada (alta/media/baixa/sem_candidato/isolado). O KPI nao inventa
// coordenada: "baixa"/"sem_candidato" vao pra observacao da entrega.

export type ConfiancaCoerencia = 'alta' | 'media' | 'baixa' | 'sem_candidato' | 'isolado'

// municipioCodigo (IBGE) vem da ponte -- o corredor da rua (corredor-rua.ts)
// usa pra ficar so' no municipio do endereco. null quando a ponte nao manda.
export type PontoZona = { lat: number; lng: number; municipioCodigo?: string | null }

export type ResultadoCoerencia = {
  lat: number | null
  lng: number | null
  municipioCodigo: string | null
  confianca: ConfiancaCoerencia
  candidatos: number
  ancora: boolean
  // TODOS os candidatos da mesma rua na zona (nao so' o escolhido) -- pedido
  // 06/09: confirma entrega se o caminhao parou em QUALQUER um deles, nao
  // so' no ponto que a coerencia escolheu. Ver kpi-rioquality/visitas.ts.
  pontosZona: PontoZona[]
}

export type GrupoCoerencia = { id: string; zona: string | null; ruas: string[] }

const TIMEOUT_MS = 240_000

function url(): string {
  const base = process.env.MONITORAMENTO_URL ?? 'http://127.0.0.1:3010'
  return `${base}/api/romaneio/geocode-coerencia`
}

const SEM_CANDIDATO: ResultadoCoerencia = { lat: null, lng: null, municipioCodigo: null, confianca: 'sem_candidato', candidatos: 0, ancora: false, pontosZona: [] }

function validarPontosZona(v: unknown): PontoZona[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
    .map(p => ({ lat: Number(p.lat), lng: Number(p.lng), municipioCodigo: typeof p.municipioCodigo === 'string' ? p.municipioCodigo : null }))
    .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng))
}

function tudoSemCandidato(grupos: GrupoCoerencia[]): Map<string, ResultadoCoerencia[]> {
  return new Map(grupos.map(g => [g.id, g.ruas.map(() => ({ ...SEM_CANDIDATO }))]))
}

function validar(r: unknown): ResultadoCoerencia {
  if (typeof r !== 'object' || r === null) return { ...SEM_CANDIDATO }
  const o = r as Record<string, unknown>
  const lat = typeof o.lat === 'number' ? o.lat : null
  const lng = typeof o.lng === 'number' ? o.lng : null
  const conf = o.confianca
  const confianca: ConfiancaCoerencia =
    conf === 'alta' || conf === 'media' || conf === 'baixa' || conf === 'isolado' ? conf : 'sem_candidato'
  const pontosZona = validarPontosZona(o.pontosZona)
  if (lat === null || lng === null) return { ...SEM_CANDIDATO, candidatos: Number(o.candidatos) || 0, pontosZona }
  return {
    lat,
    lng,
    municipioCodigo: typeof o.municipioCodigo === 'string' ? o.municipioCodigo : null,
    confianca,
    candidatos: Number(o.candidatos) || 0,
    ancora: o.ancora === true,
    pontosZona,
  }
}

// Achado 03/10: um 500 isolado do monitoramento zerava os pontos da rua e a
// RQ de 02/10 caiu de 90,4% pra 88,5% (55 entregas de corredor perdidas) sem
// aviso nenhum. Agora tenta de novo e, se ainda falhar, avisa o chamador.
const TENTATIVAS_COERENCIA = 3
const ESPERA_ENTRE_TENTATIVAS_MS = 2_000

export async function geocodificarPorCoerencia(
  grupos: GrupoCoerencia[],
  opcoes: { aoFalhar?: () => void; esperaMs?: number } = {},
): Promise<Map<string, ResultadoCoerencia[]>> {
  if (grupos.length === 0) return new Map()
  for (let t = 1; t <= TENTATIVAS_COERENCIA; t++) {
    const r = await tentarCoerencia(grupos)
    if (r) return r
    if (t < TENTATIVAS_COERENCIA) await new Promise(ok => setTimeout(ok, opcoes.esperaMs ?? ESPERA_ENTRE_TENTATIVAS_MS))
  }
  opcoes.aoFalhar?.()
  return tudoSemCandidato(grupos)
}

/** Uma chamada; `null` = falhou (rede, status, JSON) e vale tentar de novo. */
async function tentarCoerencia(grupos: GrupoCoerencia[]): Promise<Map<string, ResultadoCoerencia[]> | null> {
  const chave = process.env.MOTOR_SECRET
  if (!chave) {
    console.error('[kpi-rioquality/geocode-coerencia] MOTOR_SECRET nao configurado')
    return null
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
    console.error('[kpi-rioquality/geocode-coerencia] chamada ao monitoramento falhou:', e instanceof Error ? e.message : String(e))
    return null
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) {
    console.error(`[kpi-rioquality/geocode-coerencia] monitoramento respondeu ${res.status}`)
    return null
  }
  let data: unknown
  try {
    data = await res.json()
  } catch (e) {
    console.error('[kpi-rioquality/geocode-coerencia] resposta nao e JSON valido:', e instanceof Error ? e.message : String(e))
    return null
  }
  const brutos = (data as { grupos?: unknown })?.grupos
  if (!Array.isArray(brutos)) {
    console.error("[kpi-rioquality/geocode-coerencia] resposta sem campo 'grupos' valido")
    return null
  }
  const porId = new Map<string, unknown[]>()
  for (const g of brutos as { id?: unknown; resultados?: unknown }[]) {
    if (typeof g?.id === 'string' && Array.isArray(g.resultados)) porId.set(g.id, g.resultados)
  }
  const saida = new Map<string, ResultadoCoerencia[]>()
  for (const g of grupos) {
    const r = porId.get(g.id)
    // grupo ausente ou com tamanho diferente do pedido: nao da' pra alinhar -> sem_candidato so' pra ele
    saida.set(g.id, r && r.length === g.ruas.length ? r.map(validar) : g.ruas.map(() => ({ ...SEM_CANDIDATO })))
  }
  return saida
}
