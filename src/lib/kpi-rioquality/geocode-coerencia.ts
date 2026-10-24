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
  // Revisao Fase 2 (F2-01-a): a busca por similaridade dessa rua FALHOU no
  // monitoramento (ex.: statement timeout 57014) e a resposta saiu 200. O
  // resultado e' "nao sei", nao "sem candidato": quem chama trata como falha
  // da ponte (cache do corredor, coerenciaFalhou/RQ-08).
  falhaBusca?: true
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
  const v = validarCampos(o)
  return o.falhaBusca === true ? { ...v, falhaBusca: true } : v
}

function validarCampos(o: Record<string, unknown>): ResultadoCoerencia {
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
// F2-01 (e), achado 23/10: o 500 vem de cnefe_candidatos_por_rua batendo no
// statement_timeout de 60 s (media 9,97 s). Cada tentativa assim custa ~60 s e
// 3 delas alongavam o tick em ~200 s. Enquanto a funcao passar de 2 s, falha
// lenta tenta so' mais 1 vez, depois de uma espera maior (backoff).
const LIMITE_FUNCAO_LENTA_MS = 2_000
const TENTATIVAS_FUNCAO_LENTA = 2
const FATOR_ESPERA_FUNCAO_LENTA = 5

type Tentativa = { ok: Map<string, ResultadoCoerencia[]> } | { ok: null; lenta: boolean }

export async function geocodificarPorCoerencia(
  grupos: GrupoCoerencia[],
  opcoes: { aoFalhar?: () => void; esperaMs?: number; aoEsperar?: (ms: number) => void } = {},
): Promise<Map<string, ResultadoCoerencia[]>> {
  if (grupos.length === 0) return new Map()
  const base = opcoes.esperaMs ?? ESPERA_ENTRE_TENTATIVAS_MS
  let teto = TENTATIVAS_COERENCIA
  for (let t = 1; t <= teto; t++) {
    const r = await tentarCoerencia(grupos)
    if (r.ok) return r.ok
    if (r.lenta) teto = Math.min(teto, TENTATIVAS_FUNCAO_LENTA)
    if (t < teto) {
      // backoff: 1x, 2x a espera base; falha lenta espera 5x antes da unica retentativa
      const espera = r.lenta ? base * FATOR_ESPERA_FUNCAO_LENTA : base * 2 ** (t - 1)
      opcoes.aoEsperar?.(espera)
      await new Promise(ok => setTimeout(ok, espera))
    }
  }
  opcoes.aoFalhar?.()
  return tudoSemCandidato(grupos)
}

/** F2-01 (c): linha de log com hora (o tick nao poe hora nas linhas de erro). */
function logErro(msg: string): void {
  console.error(`${new Date().toISOString()} [kpi-rioquality/geocode-coerencia] ${msg}`)
}

/** Uma chamada; `ok: null` = falhou (rede, status, JSON) e vale tentar de
 *  novo; `lenta` = a funcao do banco (ms no corpo do 500) ou a chamada
 *  passou de LIMITE_FUNCAO_LENTA_MS. */
async function tentarCoerencia(grupos: GrupoCoerencia[]): Promise<Tentativa> {
  const chave = process.env.MOTOR_SECRET
  if (!chave) {
    logErro('MOTOR_SECRET nao configurado')
    return { ok: null, lenta: false }
  }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  const t0 = Date.now()
  let res: Response
  try {
    res = await fetch(url(), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-motor-key': chave },
      body: JSON.stringify({ grupos }),
      signal: ctrl.signal,
    })
  } catch (e) {
    logErro(`chamada ao monitoramento falhou em ${Date.now() - t0} ms: ${e instanceof Error ? e.message : String(e)}`)
    return { ok: null, lenta: Date.now() - t0 > LIMITE_FUNCAO_LENTA_MS }
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) {
    // F2-01 (c): o corpo do erro (codigo do Postgres, mensagem, ms da funcao)
    // era descartado -- agora vai no log, cortado.
    const decorrido = Date.now() - t0
    let corpo = ''
    try { corpo = (await res.text()).replace(/\s+/g, ' ').slice(0, 500) } catch { /* corpo ilegivel */ }
    let msFuncao: number | null = null
    try {
      const j = JSON.parse(corpo) as { ms?: unknown }
      if (typeof j?.ms === 'number') msFuncao = j.ms
    } catch { /* nao e' JSON */ }
    logErro(`monitoramento respondeu ${res.status} em ${decorrido} ms: ${corpo || '(sem corpo)'}`)
    return { ok: null, lenta: (msFuncao ?? decorrido) > LIMITE_FUNCAO_LENTA_MS }
  }
  let data: unknown
  try {
    data = await res.json()
  } catch (e) {
    logErro(`resposta nao e JSON valido: ${e instanceof Error ? e.message : String(e)}`)
    return { ok: null, lenta: false }
  }
  const brutos = (data as { grupos?: unknown })?.grupos
  if (!Array.isArray(brutos)) {
    logErro("resposta sem campo 'grupos' valido")
    return { ok: null, lenta: false }
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
  return { ok: saida }
}
