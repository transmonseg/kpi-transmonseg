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
  // viaRaioAmpliado (achado real 06/09): true quando o monitoramento
  // confirmou por dwell no PROPRIO endereco, so' que no raio ampliado
  // (500-800m) -- nem confirmacao normal, nem emprestada de vizinho. Ver
  // acharVisitasPorPonto/RAIO_AMPLIADO_M la.
  // menorDistanciaM (Task 3b, verificacao manual 26/09): menor distancia
  // haversine (metros, arredondada) entre o ponto e QUALQUER leitura do
  // trajeto continuo da placa no dia, dentro da janela da rota --
  // independente de ter havido dwell/parada ali (ver comentario do mesmo
  // campo em VisitaPonto, route.ts do monitoramento). null quando a ponte
  // nao tinha nenhuma posicao na janela; ausente (undefined) so' quando a
  // ponte respondeu numa versao antiga sem o campo -- validarVisitaBruta
  // trata os dois igual (ver validarResultado/melhorDistanciaPropria em
  // agregacao.ts, que ja tratam null/undefined da mesma forma).
  visitasPorNf?: Map<string, { chegada: string | null; saida: string | null; viaVizinhanca?: boolean; viaRaioAmpliado?: boolean; menorDistanciaM?: number | null }>
  // Achado real 12/09: o feed de paradas da Unitrac (/mapa_servicos/stops)
  // so' alcanca 48h -- passou disso, nenhum dia pode ser reprocessado. Foi o
  // que impediu de medir o efeito das correcoes de geocode no relatorio de
  // 10/09 (no dia 12 ja tinha saido da janela). O monitoramento guarda
  // posicao continua PERMANENTE, entao da' pra derivar as paradas de la pra
  // qualquer data. So' vem preenchido quando o chamador pede
  // (`incluirParadas`), porque o payload cresce bastante.
  paradas?: ParadaBridge[]
  // Achado real 14/09: quando true, a ponte teve leitura com atraso_min
  // acima do limiar de apagao (LIMIAR_APAGAO_MIN, ver route.ts do
  // monitoramento) na janela desta placa/dia -- as paradas derivadas
  // acima NAO sao confiaveis para esse dia (podem ser congelamento na
  // ultima posicao conhecida, nao permanencia real). resolverParadas usa
  // este campo pra decidir se prefere esta ponte ou a Unitrac.
  apagaoDeSinal?: boolean
}

/** Parada derivada do historico continuo do monitoramento -- mesma forma
 *  logica das paradas da Unitrac (chegada/saida/duracao/coordenada/
 *  classificacao), so' que a partir de dado permanente e mais fino. */
export type ParadaBridge = {
  chegada: string
  saida: string
  duracaoSeg: number
  lat: number
  lng: number
  classificacao: 'BASE' | 'FORA_BASE'
}

// latAlt/lngAlt (opcionais): coordenada de CADASTRO do alvo na Unitrac, usada
// pela ponte como candidata alternativa (raio 300m) a parada real mais
// proxima. Omitidos quando nao ha cadastro valido -- contrato antigo intacto.
// feitoEm (opcional): horario 'feito' do alvo na Unitrac em UTC real (feitoISO sao digitos de Brasilia -> +3h);
// a ponte usa so' pra desempatar paradas na mesma rua.
export type PontoEntregaBridge = { id: string; lat: number; lng: number; latAlt?: number; lngAlt?: number; feitoEm?: string }

type AlvoComCadastro = { placaNorm: string; documento: string | null; situacao?: number | null; pontoLat?: number | null; pontoLng?: number | null; feitoISO?: string | null }

const TRES_H_MS = 3 * 60 * 60 * 1000
function feitoEmUtcReal(feitoISO: unknown): string | null {
  if (typeof feitoISO !== 'string') return null
  const t = Date.parse(feitoISO.replace(/(Z|[+-]\d\d:?\d\d)$/, '') + 'Z')
  return Number.isNaN(t) ? null : new Date(t + TRES_H_MS).toISOString()
}

const coordValida = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n !== 0

/** Anexa latAlt/lngAlt (e feitoEm) a cada ponto a partir do alvo Unitrac casado por
 *  placa + NF (documento). So' anexa quando pontoLat e pontoLng sao numeros
 *  finitos e != 0; snapshot antigo (sem pontoLat) ou alvo sem cadastro
 *  deixam o ponto inalterado. Pura, nao muta a entrada. */
export function anexarCoordenadaCadastro(
  pontosPorPlaca: Map<string, PontoEntregaBridge[]>,
  alvos: AlvoComCadastro[],
): Map<string, PontoEntregaBridge[]> {
  // Agrupa por placa|NF. Alvos com feitoISO (situacao 1 ou 98) sao 'feitos' e tem precedencia sobre
  // os sem feito (pendentes, situacao 0, tambem tem cadastro valido e mandam latAlt). Mais de um
  // feito com horario divergente (>5 min) = cadastro duplicado na Unitrac: nao envia nada.
  const grupos = new Map<string, AlvoComCadastro[]>()
  for (const a of alvos) {
    if (!a.documento) continue
    const k = `${a.placaNorm}|${a.documento}`
    grupos.set(k, [...(grupos.get(k) ?? []), a])
  }
  const porChave = new Map<string, AlvoComCadastro>()
  for (const [k, lista] of grupos) {
    const feitos = lista.filter(a => feitoEmUtcReal(a.feitoISO) != null)
    const ts = feitos.map(a => Date.parse(feitoEmUtcReal(a.feitoISO)!))
    if (ts.length > 1 && Math.max(...ts) - Math.min(...ts) > 5 * 60_000) continue
    const usar = feitos.length > 0 ? feitos : lista
    porChave.set(k, usar[usar.length - 1])
  }
  const out = new Map<string, PontoEntregaBridge[]>()
  for (const [placa, pontos] of pontosPorPlaca) {
    out.set(placa, pontos.map(pt => {
      const a = porChave.get(`${placa}|${pt.id}`)
      if (!a) return pt
      const feitoEm = feitoEmUtcReal(a.feitoISO)
      return {
        ...pt,
        ...(coordValida(a.pontoLat) && coordValida(a.pontoLng) ? { latAlt: a.pontoLat, lngAlt: a.pontoLng } : {}),
        ...(feitoEm ? { feitoEm } : {}),
      }
    }))
  }
  return out
}

// Mesma referência de timeout que geocode.ts usa pra chamada de rede que
// pode pendurar -- aqui bem menor porque a rota do monitoramento só lê
// posições já persistidas (sem geocodificação externa lenta no meio).
const TIMEOUT_MS = 20_000
// Achado real 12/09 (1a execucao real do fallback, dia 09/09): pedindo
// tambem as paradas derivadas, 79 placas numa chamada so' estouraram os 20s
// -- o lado de la faz uma query de posicoes POR PLACA (dia inteiro,
// ~2500 leituras cada) e ainda clusteriza tudo. Resultado: mapa vazio,
// 268 NFs cairam em "SEM DADO DE GPS NO DIA" sem que faltasse dado nenhum.
// Modo com paradas usa prazo maior e lote menor, pra cada chamada caber
// folgada no prazo.
const TIMEOUT_PARADAS_MS = 120_000
const MAX_PLACAS_POR_CHAMADA = 200
const MAX_PLACAS_POR_CHAMADA_COM_PARADAS = 20

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

type VisitaBrutaResultado = { id: string; chegada: string | null; saida: string | null; viaVizinhanca?: boolean; viaRaioAmpliado?: boolean; menorDistanciaM?: number | null }

function validarVisitaBruta(v: unknown): VisitaBrutaResultado | null {
  if (
    typeof v === 'object' && v !== null &&
    typeof (v as VisitaBrutaResultado).id === 'string' &&
    ((v as VisitaBrutaResultado).chegada === null || typeof (v as VisitaBrutaResultado).chegada === 'string') &&
    ((v as VisitaBrutaResultado).saida === null || typeof (v as VisitaBrutaResultado).saida === 'string')
  ) {
    const obj = v as VisitaBrutaResultado
    const menorDistanciaM = typeof obj.menorDistanciaM === 'number' ? obj.menorDistanciaM : null
    return { id: obj.id, chegada: obj.chegada, saida: obj.saida, viaVizinhanca: obj.viaVizinhanca === true, viaRaioAmpliado: obj.viaRaioAmpliado === true, menorDistanciaM }
  }
  return null
}

type ResultadoBruto = {
  placa: string
  saidaBase: string | null
  chegadaBase: string | null
  kmPercorrido: number | null
  visitas?: VisitaBrutaResultado[]
  paradas?: ParadaBridge[]
  apagaoDeSinal?: unknown
}

function validarParadaBruta(p: unknown): ParadaBridge | null {
  if (
    typeof p === 'object' && p !== null &&
    typeof (p as { chegada?: unknown }).chegada === 'string' &&
    typeof (p as { saida?: unknown }).saida === 'string' &&
    typeof (p as { lat?: unknown }).lat === 'number' &&
    typeof (p as { lng?: unknown }).lng === 'number'
  ) {
    const o = p as { chegada: string; saida: string; duracaoSeg?: unknown; lat: number; lng: number; classificacao?: unknown }
    return {
      chegada: o.chegada,
      saida: o.saida,
      duracaoSeg: typeof o.duracaoSeg === 'number' ? o.duracaoSeg : 0,
      lat: o.lat,
      lng: o.lng,
      classificacao: o.classificacao === 'BASE' ? 'BASE' : 'FORA_BASE',
    }
  }
  return null
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
    const obj = r as { placa: string; saidaBase: string | null; chegadaBase: string | null; kmPercorrido: number | null; visitas?: unknown; paradas?: unknown; apagaoDeSinal?: unknown }
    const visitasBrutas = Array.isArray(obj.visitas) ? obj.visitas.map(validarVisitaBruta).filter((v): v is VisitaBrutaResultado => v !== null) : undefined
    const paradasBrutas = Array.isArray(obj.paradas) ? obj.paradas.map(validarParadaBruta).filter((v): v is ParadaBridge => v !== null) : undefined
    return { placa: obj.placa, saidaBase: obj.saidaBase, chegadaBase: obj.chegadaBase, kmPercorrido: obj.kmPercorrido, visitas: visitasBrutas, paradas: paradasBrutas, apagaoDeSinal: obj.apagaoDeSinal === true }
  }
  return null
}

async function buscarLote(
  placas: string[],
  data: string,
  pontosPorPlaca: Map<string, PontoEntregaBridge[]>,
  incluirParadas: boolean,
  fimRotaPorPlaca?: Map<string, string>,
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

  // fimRotaPorPlaca (achado real 22/09): o chamador guarda tudo na
  // convencao MASCARADA (mesma que paraBrtMascaradoComoUtc produz), mas a
  // ponte espera o instante UTC REAL -- inverso da mascara, +3h em vez de
  // -3h (Brasil sem horario de verao, offset fixo). So' manda a chave no
  // corpo pras placas DESTE lote que tem entrada, e so' inclui a chave
  // `fimRotaPorPlaca` no JSON se houver alguma -- sem mudar o contrato da
  // rota pra quem nao usa esta extensao.
  const fimRotaBody: Record<string, string> = {}
  if (fimRotaPorPlaca) {
    for (const placa of placas) {
      const fimRotaMascarado = fimRotaPorPlaca.get(placa)
      if (fimRotaMascarado) fimRotaBody[placa] = new Date(Date.parse(fimRotaMascarado) + 3 * 60 * 60 * 1000).toISOString()
    }
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), incluirParadas ? TIMEOUT_PARADAS_MS : TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(urlBaseHorarios(), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-motor-key': chave },
      body: JSON.stringify({
        placas,
        data,
        pontosPorPlaca: pontosPorPlacaBody,
        incluirParadas,
        ...(Object.keys(fimRotaBody).length > 0 ? { fimRotaPorPlaca: fimRotaBody } : {}),
      }),
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
        ? new Map(r.visitas.map((v) => [v.id, { chegada: paraBrtMascaradoComoUtc(v.chegada), saida: paraBrtMascaradoComoUtc(v.saida), viaVizinhanca: v.viaVizinhanca, viaRaioAmpliado: v.viaRaioAmpliado, menorDistanciaM: v.menorDistanciaM ?? null }]))
        : undefined
      const paradas = r.paradas?.map(p => ({
        ...p,
        chegada: paraBrtMascaradoComoUtc(p.chegada) as string,
        saida: paraBrtMascaradoComoUtc(p.saida) as string,
      }))
      mapa.set(r.placa, {
        saidaBase: paraBrtMascaradoComoUtc(r.saidaBase),
        chegadaBase: paraBrtMascaradoComoUtc(r.chegadaBase),
        kmPercorrido: r.kmPercorrido,
        visitasPorNf,
        paradas,
        apagaoDeSinal: r.apagaoDeSinal === true,
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
  incluirParadas = false,
  fimRotaPorPlaca?: Map<string, string>,
): Promise<Map<string, HorarioBase>> {
  const mapa = new Map<string, HorarioBase>()
  const tamanhoLote = incluirParadas ? MAX_PLACAS_POR_CHAMADA_COM_PARADAS : MAX_PLACAS_POR_CHAMADA
  for (let i = 0; i < placasNorm.length; i += tamanhoLote) {
    const lote = placasNorm.slice(i, i + tamanhoLote)
    const doLote = await buscarLote(lote, data, pontosPorPlaca, incluirParadas, fimRotaPorPlaca)
    for (const [placa, horario] of doLote) mapa.set(placa, horario)
  }
  return mapa
}

// Task 3b (verificacao manual 26/09): monta o Map NF -> menorDistanciaM que
// `montarDetalheEntregas` (agregacao.ts) espera em `menorDistanciaTrajetoPorNf`
// -- chave e' so' o NF (documento), igual `linha.nf` usado la (`.get(linha.nf)`),
// NAO placa|NF -- cada NF ja e' unica dentro do romaneio do dia. Fecha o
// Concern do relatorio da Task 3 (agregacao.ts): agora que a ponte
// (route.ts do monitoramento) EXPOE menorDistanciaM por visita, este helper
// vira a ponte entre `buscarHorariosBase` (por placa) e o Map por NF que
// `montarDetalheEntregas` consome. So' entra no mapa quando a ponte
// respondeu um numero de verdade (null/undefined -- sem posicao na janela,
// ou ponte antiga sem o campo -- simplesmente nao entra, `melhorDistancia
// Propria` ja trata "sem entrada no mapa" e "entrada null" da mesma forma,
// via `.get(nf) ?? null`). Usado so' pelo fluxo Nutry Max (route.ts +
// scripts/gerar-nutrimax-real-arquivo.ts) -- Rio Quality nao passa este
// mapa pra `montarDetalheEntregas`, continua com o default vazio de la.
export function montarMenorDistanciaTrajetoPorNf(horarioBasePorPlaca: Map<string, HorarioBase>): Map<string, number> {
  const mapa = new Map<string, number>()
  for (const horario of horarioBasePorPlaca.values()) {
    for (const [nf, visita] of horario.visitasPorNf ?? []) {
      if (typeof visita.menorDistanciaM === 'number') mapa.set(nf, visita.menorDistanciaM)
    }
  }
  return mapa
}
