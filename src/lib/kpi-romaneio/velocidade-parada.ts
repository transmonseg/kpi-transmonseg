// Ponte HTTP pro endpoint POST /api/romaneio/velocidade-na-parada do
// projeto irmao "monitoramento" -- mesmo padrao de geocode.ts (dois
// projetos rodam como processos PM2 IRMAOS no mesmo VPS, repos e
// node_modules separados, sem import direto possivel), mesmo header
// x-motor-key + MOTOR_SECRET.
//
// Usado por unitrac.ts (buscarParadasDoDia) pra cruzar cada parada
// FORA_BASE do feed da Unitrac contra o rastro de GPS PROPRIO
// (posicoes_historico, ingestao independente) -- ver spec 2026-09-12,
// item 3a. Achado real 11/09: a Unitrac reportou paradas dentro de 500m
// de 10 enderecos pras placas RQV6I51/TUI1A90/RQV3J99; o rastro de GPS
// proprio mostra que essas placas nunca chegaram a menos de 3,6km desses
// pontos o dia inteiro. A coordenada de parada que a Unitrac devolve
// estava errada, e o relatorio usou ela pra ACUSAR ("PASSOU NO ENDERECO
// MAS NAO REGISTROU PARADA").
//
// Fail-open, e AUDIVEL (achado da sessao de hoje: fail-open que falha
// calado e' pior que nao ter a guarda -- ninguem percebe que parou de
// proteger). Toda falha (MOTOR_SECRET ausente, rede, timeout, HTTP não-2xx,
// JSON invalido, resposta malformada, tamanho divergente) devolve um
// array do MESMO TAMANHO todo null e denuncia via console.error -- quem
// chama trata null como "sem dado pra cruzar, mantem a parada como
// estava" (nunca inventa negativa por falta de dado).
export type ConsultaVelocidadeParada = {
  placa: string
  lat: number
  lng: number
  raioM: number
  inicioIso: string
  fimIso: string
}

// temParadaComVelocidade: >=1 leitura na janela/raio com velocidade <=5km/h
// (a parada é genuína). temCobertura: >=1 leitura na janela/raio, qualquer
// velocidade (existe dado pra julgar) -- distingue "sem GPS" (fail-open,
// mantém) de "GPS mostra que o caminhão nunca parou ali" (contradição real,
// descarta). null só quando a própria entrada da consulta era malformada.
export type ResultadoVelocidadeParada = { temParadaComVelocidade: boolean; temCobertura: boolean } | null

const TIMEOUT_MS = 60_000

function urlVelocidadeParada(): string {
  const base = process.env.MONITORAMENTO_URL ?? 'http://127.0.0.1:3010'
  return `${base}/api/romaneio/velocidade-na-parada`
}

function validarResultado(r: unknown): ResultadoVelocidadeParada {
  if (
    typeof r === 'object' &&
    r !== null &&
    typeof (r as { temParadaComVelocidade?: unknown }).temParadaComVelocidade === 'boolean' &&
    typeof (r as { temCobertura?: unknown }).temCobertura === 'boolean'
  ) {
    return {
      temParadaComVelocidade: (r as { temParadaComVelocidade: boolean }).temParadaComVelocidade,
      temCobertura: (r as { temCobertura: boolean }).temCobertura,
    }
  }
  return null
}

function vazio(n: number, motivo: string): ResultadoVelocidadeParada[] {
  console.error(`[kpi-romaneio/velocidade-parada] ${motivo}`)
  return new Array(n).fill(null)
}

/** Cruza cada consulta (placa+coordenada+janela+raio) contra
 *  posicoes_historico via a ponte do monitoramento. Uma UNICA chamada
 *  HTTP em lote (nao uma promise por consulta) -- mesmo raciocinio de
 *  geocode.ts. Nunca lanca. */
export async function consultarVelocidadeNaParada(
  consultas: ConsultaVelocidadeParada[],
): Promise<ResultadoVelocidadeParada[]> {
  if (consultas.length === 0) return []

  const chave = process.env.MOTOR_SECRET
  if (!chave) return vazio(consultas.length, 'MOTOR_SECRET nao configurada -- cruzamento de velocidade pulado')

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(urlVelocidadeParada(), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-motor-key': chave },
      body: JSON.stringify({ consultas }),
      signal: ctrl.signal,
    })
  } catch (e) {
    return vazio(consultas.length, `chamada ao monitoramento falhou: ${e instanceof Error ? e.message : String(e)}`)
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) return vazio(consultas.length, `monitoramento respondeu ${res.status}`)

  let data: unknown
  try {
    data = await res.json()
  } catch (e) {
    return vazio(consultas.length, `resposta nao e JSON valido: ${e instanceof Error ? e.message : String(e)}`)
  }

  const resultadosBrutos = (data as { resultados?: unknown })?.resultados
  if (!Array.isArray(resultadosBrutos)) return vazio(consultas.length, "resposta sem campo 'resultados' valido")

  // Defensivo: nunca devolve array de tamanho diferente do pedido, mesmo
  // se o lado de la divergir (bug/versao diferente entre os dois repos) --
  // quem consome mapeia por indice contra a lista original de consultas.
  return consultas.map((_, i) => validarResultado(resultadosBrutos[i]))
}
