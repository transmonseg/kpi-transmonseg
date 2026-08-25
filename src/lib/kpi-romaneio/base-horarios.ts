// SAÍDA CD/CHEGADA CD via posição contínua real -- ponte HTTP local pro
// projeto irmão "monitoramento" (POST /api/kpi/base-horarios), mesmo
// padrão de geocode.ts (ver comentário lá pro raciocínio completo de "por
// que HTTP e não import direto").
//
// Achado real 25/08: calcular SAÍDA/CHEGADA a partir do feed de "paradas"
// da própria Unitrac (unitrac.ts, buscarParadasDoDia) e reclusterizar isso
// aqui (agregacao.ts, eventosBase) criava uma classe inteira de casos
// ambíguos -- parada real mas curta vs blip de trânsito perto da base,
// cluster que quebra errado, etc (ver correção de consolida.ts do mesmo
// dia). O monitoramento já tem posição contínua real (lat/lng a cada
// ~30-40s, o dia inteiro) que o motor de desvio já usa em produção -- dá
// pra detectar entrada/saída da base por CRUZAMENTO DE GEOFENCE direto no
// dado bruto, sem nenhuma heurística de cluster/duração mínima. Essa ponte
// é a fonte PREFERIDA; agregacao.ts cai pro cálculo antigo (eventosBase)
// só quando esta rota não tem dado pra aquela placa (fail-open em cima de
// fail-open).
//
// Fail-open: qualquer erro (rede, timeout, JSON inválido, resposta
// malformada) devolve mapa vazio -- toda placa cai pro cálculo antigo,
// nunca trava o resto do pipeline.

export type HorarioBase = { saidaBase: string | null; chegadaBase: string | null }

// Mesma referência de timeout que geocode.ts usa pra chamada de rede que
// pode pendurar -- aqui bem menor porque a rota do monitoramento só lê
// posições já persistidas (sem geocodificação externa lenta no meio).
const TIMEOUT_MS = 20_000
const MAX_PLACAS_POR_CHAMADA = 200

function urlBaseHorarios(): string {
  const base = process.env.MONITORAMENTO_URL ?? 'http://127.0.0.1:3010'
  return `${base}/api/kpi/base-horarios`
}

function validarResultado(r: unknown): { placa: string; saidaBase: string | null; chegadaBase: string | null } | null {
  if (
    typeof r === 'object' &&
    r !== null &&
    typeof (r as { placa?: unknown }).placa === 'string' &&
    ((r as { saidaBase?: unknown }).saidaBase === null || typeof (r as { saidaBase?: unknown }).saidaBase === 'string') &&
    ((r as { chegadaBase?: unknown }).chegadaBase === null || typeof (r as { chegadaBase?: unknown }).chegadaBase === 'string')
  ) {
    const obj = r as { placa: string; saidaBase: string | null; chegadaBase: string | null }
    return { placa: obj.placa, saidaBase: obj.saidaBase, chegadaBase: obj.chegadaBase }
  }
  return null
}

async function buscarLote(placas: string[], data: string): Promise<Map<string, HorarioBase>> {
  const mapa = new Map<string, HorarioBase>()
  const chave = process.env.MOTOR_SECRET
  if (!chave) {
    console.error('[kpi-romaneio/base-horarios] MOTOR_SECRET nao configurada -- pulado')
    return mapa
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(urlBaseHorarios(), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-motor-key': chave },
      body: JSON.stringify({ placas, data }),
      signal: ctrl.signal,
    })
  } catch (e) {
    console.error('[kpi-romaneio/base-horarios] chamada ao monitoramento falhou:', e instanceof Error ? e.message : String(e))
    return mapa
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    console.error(`[kpi-romaneio/base-horarios] monitoramento respondeu ${res.status}`)
    return mapa
  }

  let json: unknown
  try {
    json = await res.json()
  } catch (e) {
    console.error('[kpi-romaneio/base-horarios] resposta nao e JSON valido:', e instanceof Error ? e.message : String(e))
    return mapa
  }

  const resultados = (json as { resultados?: unknown })?.resultados
  if (!Array.isArray(resultados)) return mapa

  for (const bruto of resultados) {
    const r = validarResultado(bruto)
    if (r) mapa.set(r.placa, { saidaBase: r.saidaBase, chegadaBase: r.chegadaBase })
  }
  return mapa
}

/** Uma chamada por lote de ate MAX_PLACAS_POR_CHAMADA -- placa nao
 *  encontrada na resposta (erro parcial, placa desconhecida do lado do
 *  monitoramento) simplesmente nao aparece no mapa, tratado pelo chamador
 *  como "sem dado desta fonte, cai pro calculo antigo". */
export async function buscarHorariosBase(placasNorm: string[], data: string): Promise<Map<string, HorarioBase>> {
  const mapa = new Map<string, HorarioBase>()
  for (let i = 0; i < placasNorm.length; i += MAX_PLACAS_POR_CHAMADA) {
    const lote = placasNorm.slice(i, i + MAX_PLACAS_POR_CHAMADA)
    const doLote = await buscarLote(lote, data)
    for (const [placa, horario] of doLote) mapa.set(placa, horario)
  }
  return mapa
}
