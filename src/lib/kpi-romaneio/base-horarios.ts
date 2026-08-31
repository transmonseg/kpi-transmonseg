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

export type HorarioBase = {
  saidaBase: string | null
  chegadaBase: string | null
  kmPercorrido: number | null
  // Achado real 25/08 (3a extensao da mesma ponte): CHEGADA/SAIDA NA LOJA
  // via cruzamento de geofence por ponto de entrega, mesmo raciocinio de
  // saidaBase/chegadaBase mas por NF em vez de por base. So' presente
  // quando o chamador mandou pontos pra essa placa (buscarHorariosBase);
  // dentro do mapa, cada NF individualmente pode ter chegada/saida null
  // (nunca visitado -- ver montarVisitas.ts, que confia nisso e REMOVE
  // qualquer guess antigo pra essa NF em vez de manter).
  // viaVizinhanca (achado real 30/08): true quando o monitoramento
  // confirmou esta NF emprestando a janela de OUTRO ponto do mesmo
  // romaneio a <=800m, nao por dwell no proprio endereco -- ver
  // acharVisitasPorPonto la. Repassado ate agregacao.ts pra marcar
  // observacao distinta no relatorio (decisao do usuario 30/08).
  visitasPorNf?: Map<string, { chegada: string | null; saida: string | null; viaVizinhanca?: boolean }>
}

export type PontoEntregaBridge = { id: string; lat: number; lng: number }

// Mesma referência de timeout que geocode.ts usa pra chamada de rede que
// pode pendurar -- aqui bem menor porque a rota do monitoramento só lê
// posições já persistidas (sem geocodificação externa lenta no meio).
const TIMEOUT_MS = 20_000
const MAX_PLACAS_POR_CHAMADA = 200

function urlBaseHorarios(): string {
  const base = process.env.MONITORAMENTO_URL ?? 'http://127.0.0.1:3010'
  return `${base}/api/kpi/base-horarios`
}

// Achado real 25/08 (bug encontrado pelo usuario, "TODAS AS INFORMACOES"
// erradas -- confirmado com GPS bruto: CHEGADA CD mostrava 16:14 quando o
// dado real era ~13:15, exatos 3h de diferenca, na direcao OPOSTA do bug
// de fuso corrigido mais cedo hoje): posicoes_historico.criado_em (fonte
// desta ponte) e' timestamptz de verdade, UTC correto -- diferente do
// `_data` da Unitrac (unitrac-api/consolida.ts), que ja vem em BRT
// mascarado como UTC (documentado la). formatarHora (gerador-xlsx.ts) foi
// ajustado pra ler tudo como "ja mascarado, sem converter" -- certo pro
// dado da Unitrac, errado pro dado desta ponte (que e' UTC de verdade e
// PRECISA da conversao pra BRT). Em vez de formatarHora ter que saber de
// qual das duas fontes veio cada valor, converte aqui, na fronteira, pro
// MESMO formato mascarado que o resto do pipeline ja espera -- assim
// saidaCd/chegadaCd em agregacao.ts continuam sendo um unico tipo, uma
// unica convencao, sem condicional espalhada por formatarHora.
function paraBrtMascaradoComoUtc(isoUtcReal: string | null): string | null {
  if (isoUtcReal === null) return null
  const instante = new Date(isoUtcReal)
  if (Number.isNaN(instante.getTime())) return null
  // Brasil nao observa horario de verao -- offset fixo -03:00, sem
  // precisar de tabela de fuso (mesmo raciocinio usado em route.ts, do
  // lado do monitoramento, pra calcular a janela do dia).
  const comDigitosBrt = new Date(instante.getTime() - 3 * 60 * 60 * 1000)
  return comDigitosBrt.toISOString()
}

type VisitaBrutaResultado = { id: string; chegada: string | null; saida: string | null; viaVizinhanca?: boolean }

function validarVisitaBruta(v: unknown): VisitaBrutaResultado | null {
  if (
    typeof v === 'object' && v !== null &&
    typeof (v as VisitaBrutaResultado).id === 'string' &&
    ((v as VisitaBrutaResultado).chegada === null || typeof (v as VisitaBrutaResultado).chegada === 'string') &&
    ((v as VisitaBrutaResultado).saida === null || typeof (v as VisitaBrutaResultado).saida === 'string')
  ) {
    const obj = v as VisitaBrutaResultado
    return { id: obj.id, chegada: obj.chegada, saida: obj.saida, viaVizinhanca: obj.viaVizinhanca === true }
  }
  return null
}

type ResultadoBruto = {
  placa: string
  saidaBase: string | null
  chegadaBase: string | null
  kmPercorrido: number | null
  visitas?: VisitaBrutaResultado[]
}

function validarResultado(r: unknown): ResultadoBruto | null {
  if (
    typeof r === 'object' &&
    r !== null &&
    typeof (r as { placa?: unknown }).placa === 'string' &&
    ((r as { saidaBase?: unknown }).saidaBase === null || typeof (r as { saidaBase?: unknown }).saidaBase === 'string') &&
    ((r as { chegadaBase?: unknown }).chegadaBase === null || typeof (r as { chegadaBase?: unknown }).chegadaBase === 'string') &&
    ((r as { kmPercorrido?: unknown }).kmPercorrido === null || typeof (r as { kmPercorrido?: unknown }).kmPercorrido === 'number')
  ) {
    const obj = r as { placa: string; saidaBase: string | null; chegadaBase: string | null; kmPercorrido: number | null; visitas?: unknown }
    const visitasBrutas = Array.isArray(obj.visitas) ? obj.visitas.map(validarVisitaBruta).filter((v): v is VisitaBrutaResultado => v !== null) : undefined
    return { placa: obj.placa, saidaBase: obj.saidaBase, chegadaBase: obj.chegadaBase, kmPercorrido: obj.kmPercorrido, visitas: visitasBrutas }
  }
  return null
}

async function buscarLote(
  placas: string[],
  data: string,
  pontosPorPlaca: Map<string, PontoEntregaBridge[]>,
): Promise<Map<string, HorarioBase>> {
  const mapa = new Map<string, HorarioBase>()
  const chave = process.env.MOTOR_SECRET
  if (!chave) {
    console.error('[kpi-romaneio/base-horarios] MOTOR_SECRET nao configurada -- pulado')
    return mapa
  }

  // So' manda `pontosPorPlaca` no corpo pras placas DESTE lote que tem
  // pontos -- objeto vazio quando nenhuma tem (placas sem romaneio
  // geocodificado ainda, por exemplo), sem mudar o contrato da rota.
  const pontosPorPlacaBody: Record<string, PontoEntregaBridge[]> = {}
  for (const placa of placas) {
    const pontos = pontosPorPlaca.get(placa)
    if (pontos && pontos.length > 0) pontosPorPlacaBody[placa] = pontos
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(urlBaseHorarios(), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-motor-key': chave },
      body: JSON.stringify({ placas, data, pontosPorPlaca: pontosPorPlacaBody }),
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
    if (r) {
      const visitasPorNf = r.visitas
        ? new Map(r.visitas.map((v) => [v.id, { chegada: paraBrtMascaradoComoUtc(v.chegada), saida: paraBrtMascaradoComoUtc(v.saida), viaVizinhanca: v.viaVizinhanca }]))
        : undefined
      mapa.set(r.placa, {
        saidaBase: paraBrtMascaradoComoUtc(r.saidaBase),
        chegadaBase: paraBrtMascaradoComoUtc(r.chegadaBase),
        kmPercorrido: r.kmPercorrido,
        visitasPorNf,
      })
    }
  }
  return mapa
}

/** Uma chamada por lote de ate MAX_PLACAS_POR_CHAMADA -- placa nao
 *  encontrada na resposta (erro parcial, placa desconhecida do lado do
 *  monitoramento) simplesmente nao aparece no mapa, tratado pelo chamador
 *  como "sem dado desta fonte, cai pro calculo antigo".
 *
 *  `pontosPorPlaca` (opcional): coordenadas geocodificadas de cada
 *  NF/entrega, pra pedir tambem CHEGADA/SAIDA NA LOJA via a mesma
 *  posicao continua (ver visitasPorNf em HorarioBase). Placa sem entrada
 *  neste mapa simplesmente nao pede visitas -- so' pede saida/chegada/km
 *  da base, comportamento identico a antes desta extensao. */
export async function buscarHorariosBase(
  placasNorm: string[],
  data: string,
  pontosPorPlaca: Map<string, PontoEntregaBridge[]> = new Map(),
): Promise<Map<string, HorarioBase>> {
  const mapa = new Map<string, HorarioBase>()
  for (let i = 0; i < placasNorm.length; i += MAX_PLACAS_POR_CHAMADA) {
    const lote = placasNorm.slice(i, i + MAX_PLACAS_POR_CHAMADA)
    const doLote = await buscarLote(lote, data, pontosPorPlaca)
    for (const [placa, horario] of doLote) mapa.set(placa, horario)
  }
  return mapa
}
