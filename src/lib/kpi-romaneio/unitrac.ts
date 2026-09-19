import { buscarFrota, buscarAlvos, buscarStopsCru, consolidaParadasApi, type AlvoApi } from '@/lib/unitrac-api'
// RAIO_CLUSTER_M importado direto do submodulo (nao do barrel '@/lib/
// unitrac-api') de proposito -- unitrac.test.ts mocka o barrel inteiro
// pra buscarFrota/buscarAlvos/buscarStopsCru/consolidaParadasApi, e um
// import daqui pegaria `undefined` do mock em vez da constante real.
import { RAIO_CLUSTER_M } from '@/lib/unitrac-api/consolida'
// UnitracParadaRow é definido em matcher.ts (Benassi), não em unitrac-api --
// consolida.ts importa de lá mas não reexporta.
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import { COD_USER_NUTRIMAX, BASES_COORD_NUTRIMAX } from './constants'
import { consultarVelocidadeNaParada } from './velocidade-parada'
import { hojeBR } from '@/lib/data-br'

/** Alvos (plano de entregas) do dia pras placas da escala. Resolve placa → cv
 *  via frota da conta Nutrimax; placa sem correspondência na frota é ignorada
 *  (best-effort, nunca lança). */
export async function buscarAlvosDoDia(placas: string[]): Promise<AlvoApi[]> {
  const frota = await buscarFrota(COD_USER_NUTRIMAX)
  const cvs = frota.filter(v => placas.includes(v.placaNorm)).map(v => v.cv)
  if (cvs.length === 0) return []
  return buscarAlvos(cvs)
}

/** GPS real do dia pra uma placa, classificado só em BASE/FORA_BASE --
 *  NUNCA LOJA (a geofence de loja da Unitrac tem erro conhecido, não
 *  usamos ela pra decidir visita -- ver montarVisitas.ts, task futura). */
export async function buscarParadasDoDia(cv: string, placaNorm: string, data: string, horas: number): Promise<UnitracParadaRow[]> {
  const eventos = await buscarStopsCru(cv, horas)
  // pontos={} garante que consolidaParadasApi nunca resolve geofence de
  // loja (acharLojaPorCoordenada itera Object.values({}) = vazio, sempre
  // retorna null) -- todo cluster fora da base vira FORA_BASE, que é
  // exatamente a granularidade que queremos (a classificação real de
  // visita é nossa, feita em montarVisitas.ts contra o endereço geocodificado).
  const paradas = consolidaParadasApi(eventos, {}, data, placaNorm, BASES_COORD_NUTRIMAX)
  return validarParadasContraGpsProprio(descartarParadaAbertaAlemDoDia(paradas, data), placaNorm)
}

// Achado real 14/09 (Task 7 do motor de confirmacao): ao reprocessar um dia
// PASSADO durante um apagao de sinal, a Unitrac pode devolver uma UNICA
// parada BASE que nunca fechou -- chegada no dia pedido, saida/fim_real so'
// na data de HOJE (ou depois), como se o veiculo ainda estivesse la agora.
// Caso real 12/09 (RQV6I51/RBI0J25/TOS1H26/RQU8D91/RQU4B93): GPS proprio
// (posicoes_historico) mostra 90+km percorridos e velocidade ate 95km/h no
// mesmo dia -- a parada e' lixo de API (geofence que nao fechou do lado
// deles), nao um catch-up real pos-apagao. So' pode acontecer pra dia
// PASSADO -- pro dia de hoje, uma parada "ainda em andamento" e' normal e
// esperada, nao descartar. Descartar aqui (antes de resolverParadas) faz o
// array ficar vazio nesse caso, o que ja' aciona o fallback pra ponte que
// resolverParadas ja' tem pra "Unitrac nao devolveu nada".
// Exportada pra Rio Quality tambem usar (pipeline.ts monta seu proprio
// daUnitrac direto de consolidaParadasApi, sem passar por buscarParadasDoDia
// -- mesmo risco de parada BASE degenerada, mesmo conserto).
export function descartarParadaAbertaAlemDoDia(paradas: UnitracParadaRow[], data: string): UnitracParadaRow[] {
  const hoje = hojeBR()
  if (data >= hoje) return paradas
  return paradas.filter(p => {
    const fimIso = p.fim_real ?? p.saida
    if (!fimIso) return true
    return fimIso.slice(0, 10) < hoje
  })
}

// Item 3a (spec 2026-09-12, "Endurecimento da confirmacao"): as paradas de
// consolidaParadasApi vem so' do feed de "stops" da Unitrac, que reporta
// sua PROPRIA coordenada de parada -- sem velocidade nenhuma pra
// confirmar. Achado real 11/09: Unitrac reportou paradas dentro de 500m
// de 10 enderecos pras placas RQV6I51/TUI1A90/RQV3J99; o rastro de GPS
// PROPRIO (posicoes_historico, ingestao independente) mostra que essas
// placas nunca chegaram a menos de 3,6-18,3km desses pontos o dia
// inteiro -- a coordenada da Unitrac estava errada, e o relatorio usava
// ela pra ACUSAR ("PASSOU NO ENDERECO MAS NAO REGISTROU PARADA").
//
// So' FORA_BASE entra na checagem (BASE nunca precisa de confirmacao de
// entrega). Uma UNICA chamada em lote pra ponte (nao uma por parada) --
// tipicamente um punhado de paradas por placa/dia; o gerador processa varias
// placas em paralelo (concorrencia limitada por mapComLimite /
// LIMITE_CONCORRENCIA_PLACAS), entao chamada sequencial por parada aqui
// multiplicaria round-trips desnecessariamente.
//
// Regra fail-open: so' descarta quando ha' CONTRADICAO REAL (cobertura de
// GPS na janela E nenhuma leitura parada) -- sem cobertura, ou se a
// propria chamada da ponte falhar, MANTEM a parada como veio (nunca
// inventa negativa por falta de dado).
async function validarParadasContraGpsProprio(paradas: UnitracParadaRow[], placaNorm: string): Promise<UnitracParadaRow[]> {
  const foraBase = paradas.filter((p): p is UnitracParadaRow & { lat: number; lng: number } =>
    p.classificacao === 'FORA_BASE' && p.lat != null && p.lng != null)
  if (foraBase.length === 0) return paradas

  const resultados = await consultarVelocidadeNaParada(foraBase.map(p => ({
    placa: placaNorm,
    lat: p.lat,
    lng: p.lng,
    raioM: RAIO_CLUSTER_M,
    // Janela da PERMANENCIA real (chegada -> fim_real), nao ate' `saida`
    // (que inclui o trajeto ate' o proximo lugar, ver consolida.ts) --
    // senao o cruzamento poderia contradizer uma parada genuina so'
    // porque o caminhao ja estava em movimento rumo ao proximo cluster
    // dentro da propria janela verificada.
    inicioIso: p.chegada,
    fimIso: p.fim_real ?? p.saida ?? p.chegada,
  })))

  const descartar = new Set<string>()
  foraBase.forEach((p, i) => {
    const r = resultados[i]
    if (r && r.temCobertura && !r.temParadaComVelocidade) descartar.add(p.id)
  })
  if (descartar.size === 0) return paradas
  return paradas.filter(p => !descartar.has(p.id))
}

// Achado real 12/09 (auditoria KPI Nutry Max): buscarStopsCru so' alcanca
// 48h. No dia 12 nao dava mais pra reprocessar o dia 10 pra medir o efeito
// das correcoes de geocode -- e' o mesmo teto que ja bloqueia reauditoria de
// qualquer dia passado. O monitoramento guarda posicao continua PERMANENTE,
// entao da' pra montar as mesmas paradas de la (ver derivarParadas na rota
// /api/kpi/base-horarios). Converte pro formato que o resto do pipeline ja'
// consome (UnitracParadaRow), sem geofence de loja -- BASE/FORA_BASE so',
// mesma granularidade de buscarParadasDoDia.
// LIMITE CONHECIDO, medido no dia 09/09 (2361 NFs, mesmo dia pelos dois
// caminhos): a ponte confirma 1978 entregas contra 2075 do feed da Unitrac.
// A diferenca NAO e' o piso de duracao (testado 5min e 2min, mesmo numero) --
// e' APAGAO DE SINAL. Quando o rastreador para de comunicar, o polling deste
// projeto continua gravando a ULTIMA posicao conhecida (com atraso_min
// subindo), entao a posicao continua fica congelada e nao ha dwell pra
// derivar; ja o feed da Unitrac recebe o trecho em lote quando o aparelho
// reconecta, e mostra as paradas que aconteceram no apagao. Caso documentado
// nesta sessao: RQV3G18 em 09/09, atraso subindo de 2 para 34+ min enquanto
// a placa rodava Trapiche/Macae.
//
// Por isso a ordem importa: a ponte manda sempre que tiver dado, janela ou
// nao -- so' cai pro feed da Unitrac quando ha' apagao de sinal detectado
// (ver apagaoDeSinal/teveApagaoDeSinal), porque so' a Unitrac recebe o
// trecho em lote ao reconectar, algo que a ponte nao reconstroi a partir
// de uma ultima posicao conhecida congelada. MAS essa troca so' vale se a
// Unitrac realmente tiver algo pra devolver: buscarStopsCru so' alcanca as
// 48h que antecedem AGORA (ver achado 11/09 abaixo), entao qualquer data
// fora dessa janela chega aqui com daUnitrac=[] mesmo tendo havido apagao
// de verdade -- nesse caso "usar a Unitrac" e' na pratica zerar o dia
// inteiro da placa, nao usar um feed melhor. Medido em producao em 14/09
// (7 dias, motor de confirmacao): 25,7% dos placa/dia (724 de 2.819) tem
// pelo menos uma leitura com sinal degradado -- isso NAO e' raro, entao
// reprocessar qualquer dia com mais de 48h e apagao detectado sem essa
// checagem apagaria dado bom da ponte pra ~1/4 das placas. Por isso o
// gate abaixo e' `apagaoDeSinal && daUnitrac.length > 0`, nao so'
// `apagaoDeSinal`: a Unitrac so' pode vencer a ponte quando de fato tem
// alguma coisa pra mostrar pra esse dia.
//
// Proximo passo pra fechar essa lacuna: persistir as paradas da Unitrac no
// momento da geracao (elas ja sao buscadas), pra que reprocessar um dia
// antigo use exatamente a mesma entrada que gerou os numeros originais.
// Achado real 11/09 (regeneracao do dia 11 feita em 13/09): dentro dessa
// mesma janela de 48h, buscarStopsCru conta as horas PRA TRAS DE AGORA, nao
// da data pedida. Regenerar um dia de dois dias atras faz a Unitrac devolver
// so' a FATIA do dia que ainda cabe nas 48h -- normalmente so' a madrugada,
// caminhao parado na base. A escolha de fonte NAO PODE ser "a API devolveu
// algo?" (daUnitrac.length > 0), porque esse retalho tem length>0 e passa
// como se fosse o dia inteiro -- agregacao.ts conclui NUNCA SAIU DA BASE pra
// toda placa cujas paradas sobreviventes sao so' de base (313 NFs marcadas
// erradas em producao). A escolha certa e' por "a data pedida esta fora do
// alcance da API?" (foraDaJanela, ver foraDoAlcanceApi em constants.ts) --
// isso decidia se o feed parcial da Unitrac era confiavel ou nao. `foraDaJanela`
// nao e' mais parametro desta funcao (substituido por `apagaoDeSinal` numa
// fase seguinte, ver achado 14/09 abaixo) -- a regra atual e' a descrita la':
// so' cai pra Unitrac quando ha' apagao E a Unitrac tem dado pra esse dia.
// Achado real 14/09 (fase que torna a ponte fonte PRIMARIA, nao so'
// fallback pra fora da janela): a inversao de prioridade abaixo e'
// segura DESDE QUE o chamador tenha checado apagao de sinal antes --
// ver teveApagaoDeSinal (monitoramento, route.ts) e o comentario em
// HorarioBase.apagaoDeSinal (base-horarios.ts). Sem essa checagem, um
// apagao faria a ponte parecer que tem dado bom (congelado na ultima
// posicao) bem na hora em que a Unitrac tem a informacao certa
// (recebe o trecho em lote ao reconectar) -- teria revertido a fase
// 3a em vez de completa-la.
export function resolverParadas(
  daUnitrac: UnitracParadaRow[],
  daPonte: { chegada: string; saida: string; duracaoSeg: number; lat: number; lng: number; classificacao: 'BASE' | 'FORA_BASE' }[] | undefined,
  placaNorm: string,
  apagaoDeSinal: boolean,
): UnitracParadaRow[] {
  if (apagaoDeSinal && daUnitrac.length > 0) return daUnitrac
  return daPonte?.length ? paradasDaPonte(daPonte, placaNorm) : daUnitrac
}

export function paradasDaPonte(
  paradas: { chegada: string; saida: string; duracaoSeg: number; lat: number; lng: number; classificacao: 'BASE' | 'FORA_BASE' }[],
  placaNorm: string,
): UnitracParadaRow[] {
  return paradas.map((p, i) => ({
    id: `${placaNorm}-ponte-${i + 1}`,
    placa_norm: placaNorm,
    chegada: p.chegada,
    saida: p.saida,
    // A ponte devolve o fim REAL da permanencia (ultima leitura parada), nao
    // a chegada do proximo lugar -- entao fim_real e saida coincidem aqui,
    // diferente do feed da Unitrac (ver consolidaParadasApi).
    fim_real: p.saida,
    duracao_seg: p.duracaoSeg,
    local_parada: p.classificacao === 'BASE' ? 'BASE' : 'FORA DE BASE E LOCAL DE SERVICO',
    codigo_loja: null,
    nome_loja: null,
    lat: p.lat,
    lng: p.lng,
    endereco: null,
    classificacao: p.classificacao,
    ordem: i + 1,
  }))
}
