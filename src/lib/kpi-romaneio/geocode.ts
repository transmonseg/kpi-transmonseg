// Geocodificacao de endereco do romaneio Nutry Max -- ponte HTTP local pro
// projeto irmao "monitoramento" (POST /api/romaneio/geocode).
//
// Por que HTTP e nao import direto: os dois projetos rodam como processos
// PM2 IRMAOS no mesmo VPS (transmonseg-vps), repos e node_modules
// separados -- sem import direto possivel.
//
// Por que HTTP e nao reimplementar a cascata aqui: a investigacao da
// Task 3 (ver .superpowers/sdd/2026-08-23-kpi-romaneio-nutrimax/
// task-3-report.md) confirmou que `geocodificarEndereco`
// (monitoramento/src/lib/romaneio-geocode.ts) e' uma funcao pura em
// relacao a `romaneio_pontos` -- ela so' le/escreve num cache de endereco
// (`romaneio_geocode_cache`) e em tabelas de referencia (CNEFE/IBGE,
// extrato OSM), nunca na tabela que o motor de desvio usa em producao.
// Isolar isso numa rota nova NAO exige tocar em nenhum arquivo existente
// do monitoramento -- so' importar as funcoes ja exportadas de la. Preferir
// isso a duplicar a cascata (CNEFE + OSM local + Google + Nominatim, com
// resolucao de ponto de referencia por cidade/bairro pra descartar rua
// homonima em municipio errado -- anos de "achado real" documentados nos
// comentarios de la) e' o caminho certo: mesmo endereco, mesmo formato de
// romaneio (Nutry Max), mesma precisao, sem manter duas implementacoes
// divergentes.
//
// A rota de la (monitoramento/src/app/api/romaneio/geocode/route.ts) e'
// isolada e side-effect-free (nunca escreve em nenhuma tabela -- so' LE
// cache/CNEFE/OSM pra acelerar/precisao), protegida pelo mesmo header
// x-motor-key + MOTOR_SECRET das outras rotas internas de la (motor,
// motor-romaneio, processar-geocode).
//
// Fail-open por endereco (ver spec: uma linha sem coordenada ainda pode
// ser confirmada via Unitrac) -- NENHUM erro (rede, timeout, JSON
// invalido, resposta malformada, tamanho de resposta divergente) lanca
// daqui. Pior caso: todo mundo volta null, o resto do pipeline continua.

export type ResultadoGeocode = { lat: number; lng: number } | null

// A rota do monitoramento rejeita lotes acima de MAX_ENDERECOS_POR_CHAMADA
// (ver route.ts la) -- precisa bater exatamente com o teto de la, senao
// lote grande volta 400 em vez de ser dividido. Achado real (23/08/2026,
// validacao com romaneio de 31/07): um dia real da Nutry Max teve 1716
// enderecos unicos, bem acima do "dezenas por dia" assumido originalmente
// -- sem particionar em lotes, a chamada inteira falhava com 400.
const LOTE_MAX_ENDERECOS = 300

// Mesma referencia que TIMEOUT_UNITRAC_MS no monitoramento (usada la pra
// chamada de rede que pode pendurar) -- uma chamada de geocodificacao
// nunca deve travar o pipeline inteiro sem limite.
//
// Nota sobre o numero: cada lote e' UMA UNICA chamada HTTP (ate
// LOTE_MAX_ENDERECOS enderecos de uma vez), nao uma promise por endereco --
// arquitetura sequencial do lado de la tambem (ver processar-geocode/
// route.ts: ~74% dos enderecos resolvem local/rapido, ~26% caem no
// Nominatim throttled a 1,1s cada). Pior caso de um lote cheio (300
// enderecos, ~26% = 78 no Nominatim a 1,1s cada) fica perto de 90s --
// timeout generoso o suficiente pra cobrir isso com folga, sem travar
// pra sempre se o monitoramento cair.
const GEOCODE_TIMEOUT_MS = 180_000

function urlGeocode(): string {
  const base = process.env.MONITORAMENTO_URL ?? 'http://127.0.0.1:3010'
  return `${base}/api/romaneio/geocode`
}

/** Fail-open por design cobre "esses enderecos especificos nao
 *  geocodificaram" -- mas fica indistinguivel de "a rota do monitoramento
 *  esta inalcancavel" (MONITORAMENTO_URL errado, projeto fora do mesmo
 *  host) quando 100% do lote volta null. So' denuncia com lote de tamanho
 *  > 1 (endereco unico que falha e' indistinguivel de "esse endereco
 *  especifico nao geocodificou", sinal fraco demais); nunca lanca, nunca
 *  muda o retorno -- so' o log. */
function avisarSeLoteFalhouTotalmente(n: number): void {
  if (n > 1) {
    console.error(
      '[kpi-romaneio/geocode] geocodificação falhou para 100% do lote -- verifique conectividade com MONITORAMENTO_URL',
    )
  }
}

/** Todo caminho de erro (rede, HTTP, JSON invalido, campo ausente) devolve
 *  um lote inteiramente null -- passa por aqui, que tambem aciona o aviso
 *  de falha total do lote. */
function resultadosVazios(n: number): ResultadoGeocode[] {
  avisarSeLoteFalhouTotalmente(n)
  return new Array(n).fill(null)
}

function validarResultado(r: unknown): ResultadoGeocode {
  if (
    typeof r === 'object' &&
    r !== null &&
    typeof (r as { lat?: unknown }).lat === 'number' &&
    typeof (r as { lng?: unknown }).lng === 'number'
  ) {
    return { lat: (r as { lat: number }).lat, lng: (r as { lng: number }).lng }
  }
  return null
}

/** Geocodifica uma lista de enderecos brasileiros. Falha em um endereco
 *  individual NAO lanca -- devolve null naquela posicao (fail-open, ver
 *  spec: uma linha sem coordenada ainda pode ser confirmada via Unitrac).
 *  Particiona em lotes de ate LOTE_MAX_ENDERECOS e chama sequencialmente
 *  (nunca em paralelo -- o lado de la ja e' sequencial internamente pro
 *  throttle do Nominatim, chamadas paralelas so' competiriam pelo mesmo
 *  rate limit sem ganhar nada). */
export async function geocodificarEnderecos(enderecos: string[]): Promise<ResultadoGeocode[]> {
  if (enderecos.length === 0) return []
  if (enderecos.length <= LOTE_MAX_ENDERECOS) return geocodificarLote(enderecos)

  const resultados: ResultadoGeocode[] = []
  for (let i = 0; i < enderecos.length; i += LOTE_MAX_ENDERECOS) {
    const lote = enderecos.slice(i, i + LOTE_MAX_ENDERECOS)
    resultados.push(...await geocodificarLote(lote))
  }
  return resultados
}

async function geocodificarLote(enderecos: string[]): Promise<ResultadoGeocode[]> {
  const chave = process.env.MOTOR_SECRET
  if (!chave) {
    console.error('[kpi-romaneio/geocode] MOTOR_SECRET nao configurada -- geocodificacao pulada')
    return resultadosVazios(enderecos.length)
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), GEOCODE_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(urlGeocode(), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-motor-key': chave },
      body: JSON.stringify({ enderecos }),
      signal: ctrl.signal,
    })
  } catch (e) {
    console.error('[kpi-romaneio/geocode] chamada ao monitoramento falhou:', e instanceof Error ? e.message : String(e))
    return resultadosVazios(enderecos.length)
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    console.error(`[kpi-romaneio/geocode] monitoramento respondeu ${res.status}`)
    return resultadosVazios(enderecos.length)
  }

  let data: unknown
  try {
    data = await res.json()
  } catch (e) {
    console.error('[kpi-romaneio/geocode] resposta nao e JSON valido:', e instanceof Error ? e.message : String(e))
    return resultadosVazios(enderecos.length)
  }

  const resultadosBrutos = (data as { resultados?: unknown })?.resultados
  if (!Array.isArray(resultadosBrutos)) {
    console.error("[kpi-romaneio/geocode] resposta sem campo 'resultados' valido")
    return resultadosVazios(enderecos.length)
  }

  // Defensivo: mesmo se o lado de la devolver tamanho diferente (bug/
  // versao divergente entre os dois repos), NUNCA devolve um array de
  // tamanho diferente do pedido -- quem consome mapeia por indice contra
  // a lista original de enderecos.
  const resultados = enderecos.map((_, i) => validarResultado(resultadosBrutos[i]))

  if (resultados.every(r => r === null)) avisarSeLoteFalhouTotalmente(resultados.length)

  return resultados
}
