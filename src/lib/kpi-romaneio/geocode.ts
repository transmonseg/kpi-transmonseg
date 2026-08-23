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
//
// Cache PROPRIO deste lado (kpi_romaneio_geocode_cache) por cima da ponte
// HTTP -- a rota do monitoramento e' side-effect-free de proposito (nunca
// escreve), entao sem esse cache aqui TODO dia reprocessa do zero os
// mesmos enderecos recorrentes de um romaneio que se repete (achado real
// 23/08/2026: >1700 enderecos, minutos de espera por geracao so' de
// Nominatim throttled). Match exato por string -- sem normalizacao.
// Leitura/escrita no cache tambem sao fail-open: erro aqui nunca bloqueia
// a geocodificacao, so' faz o endereco seguir pro caminho lento normal.

import { createServiceClient } from '@/lib/supabase/service'

export type ResultadoGeocode = { lat: number; lng: number } | null

// Teto de itens por filtro `.in()` na leitura do cache -- request GET,
// endereco vai na URL; lote grande demais estoura tamanho de URL e o
// fetch falha antes de sair (achado real 24/08/2026: 200 enderecos reais
// da Nutry Max, com ~80+ caracteres cada, gerava URL longa o bastante pra
// TODA leitura de cache falhar com "fetch failed", nunca chegando no
// servidor). 20 enderecos por chamada fica bem dentro de qualquer limite
// pratico de URL mesmo com endereco de 100+ caracteres. Nao precisa bater
// com LOTE_MAX_ENDERECOS (aquele e' sobre o POST pro monitoramento, corpo
// JSON, sem esse limite).
const LOTE_CACHE_LEITURA = 20

// A rota do monitoramento rejeita lotes acima de MAX_ENDERECOS_POR_CHAMADA=300
// (ver route.ts la), mas o teto que a gente manda por chamada e' bem menor
// que isso de proposito -- ver GEOCODE_TIMEOUT_MS abaixo pro motivo. Achado
// real (23/08/2026, validacao com romaneio de 31/07, regiao rural
// Porciuncula/Itaperuna/Natividade): um dia real da Nutry Max teve 1716
// enderecos unicos, e a fracao que cai no Nominatim (sem CNEFE/OSM local
// bom pra essas cidades pequenas) foi bem maior que os ~26% observados na
// area urbana/Benassi -- um lote de 300 com timeout de 180s ainda estourou.
const LOTE_MAX_ENDERECOS = 120

// Mesma referencia que TIMEOUT_UNITRAC_MS no monitoramento (usada la pra
// chamada de rede que pode pendurar) -- uma chamada de geocodificacao
// nunca deve travar o pipeline inteiro sem limite.
//
// Nota sobre o numero: cada lote e' UMA UNICA chamada HTTP (ate
// LOTE_MAX_ENDERECOS enderecos de uma vez), nao uma promise por endereco --
// arquitetura sequencial do lado de la tambem (ver processar-geocode/
// route.ts). Pior caso pessimista (100% do lote caindo no Nominatim
// throttled a 1,1s cada, cenario real visto em regiao rural -- ver nota de
// LOTE_MAX_ENDERECOS) com lote de 120 fica em ~132s; 300s da mais que o
// dobro de folga sem deixar travado pra sempre se o monitoramento cair.
const GEOCODE_TIMEOUT_MS = 300_000

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

/** Le o que ja tiver no cache proprio pros enderecos pedidos. Fail-open:
 *  qualquer erro (conexao, tabela ausente) devolve mapa vazio -- endereco
 *  vira "faltante" e segue pro caminho lento normal, nunca trava aqui. */
async function buscarNoCache(enderecos: string[]): Promise<Map<string, { lat: number; lng: number }>> {
  const encontrados = new Map<string, { lat: number; lng: number }>()

  for (let i = 0; i < enderecos.length; i += LOTE_CACHE_LEITURA) {
    const lote = enderecos.slice(i, i + LOTE_CACHE_LEITURA)
    try {
      const supabase = createServiceClient()
      const { data, error } = await supabase
        .from('kpi_romaneio_geocode_cache')
        .select('endereco, lat, lng')
        .in('endereco', lote)
      if (error) {
        console.error('[kpi-romaneio/geocode] leitura do cache falhou (segue sem cache):', error.message)
        continue
      }
      for (const row of data ?? []) {
        encontrados.set(row.endereco as string, { lat: row.lat as number, lng: row.lng as number })
      }
    } catch (e) {
      console.error('[kpi-romaneio/geocode] leitura do cache falhou (segue sem cache):', e instanceof Error ? e.message : String(e))
    }
  }

  return encontrados
}

/** Grava no cache proprio os enderecos recem-resolvidos (nunca os que
 *  vieram null -- endereco que nao geocodificou hoje pode geocodificar
 *  amanha com o mesmo texto, nao vale a pena persistir uma falha).
 *  Best-effort: erro aqui nunca propaga, resultado ja foi calculado. */
async function salvarNoCache(enderecos: string[], resultados: ResultadoGeocode[]): Promise<void> {
  const linhas = enderecos
    .map((endereco, i) => ({ endereco, resultado: resultados[i] }))
    .filter((x): x is { endereco: string; resultado: { lat: number; lng: number } } => x.resultado !== null)
    .map(x => ({ endereco: x.endereco, lat: x.resultado.lat, lng: x.resultado.lng }))

  if (linhas.length === 0) return

  try {
    const supabase = createServiceClient()
    const { error } = await supabase.from('kpi_romaneio_geocode_cache').upsert(linhas, { onConflict: 'endereco' })
    if (error) console.error('[kpi-romaneio/geocode] gravação no cache falhou (resultado ja foi calculado, sem impacto):', error.message)
  } catch (e) {
    console.error('[kpi-romaneio/geocode] gravação no cache falhou (resultado ja foi calculado, sem impacto):', e instanceof Error ? e.message : String(e))
  }
}

/** Geocodifica uma lista de enderecos brasileiros. Falha em um endereco
 *  individual NAO lanca -- devolve null naquela posicao (fail-open, ver
 *  spec: uma linha sem coordenada ainda pode ser confirmada via Unitrac).
 *  Consulta o cache proprio primeiro -- so' os enderecos que faltam vao
 *  pra ponte HTTP, particionados em lotes de ate LOTE_MAX_ENDERECOS e
 *  chamados sequencialmente (nunca em paralelo -- o lado de la ja e'
 *  sequencial internamente pro throttle do Nominatim, chamadas paralelas
 *  so' competiriam pelo mesmo rate limit sem ganhar nada). */
export async function geocodificarEnderecos(enderecos: string[]): Promise<ResultadoGeocode[]> {
  if (enderecos.length === 0) return []

  const doCache = await buscarNoCache(enderecos)
  const faltantes = enderecos.filter(e => !doCache.has(e))

  const porFaltante = new Map<string, ResultadoGeocode>()
  if (faltantes.length > 0) {
    const resolvidos = await geocodificarPorLotes(faltantes)
    faltantes.forEach((e, i) => porFaltante.set(e, resolvidos[i]))
    await salvarNoCache(faltantes, resolvidos)
  }

  return enderecos.map(e => doCache.get(e) ?? porFaltante.get(e) ?? null)
}

async function geocodificarPorLotes(enderecos: string[]): Promise<ResultadoGeocode[]> {
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
