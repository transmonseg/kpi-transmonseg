// Achado real 30/09 (relatorio PXS 53707, KPI Nutry Max de 29/09): RQO9H37
// (Pao, romaneio 4, 12 NFs) saiu SEM RASTREADOR, mas tinha GPS completo. A
// frota Unitrac 4096 e a tabela `veiculos` do monitoramento tem DUAS
// entradas pro mesmo caminhao: 'RQO-9H37' (cv 24138, rastreador antigo,
// parado na base com atraso de 765-2204 min) e 'RQ0-9H37' (cv 24343, ZERO no
// lugar do O, rastreador novo cadastrado em 28/09, GPS do dia inteiro). Tudo
// casava por normPlaca exato -> a placa do romaneio caia no cv morto e a
// deteccao SEM SINAL NO DIA concluia "sem rastreador".
//
// Alias ESTRITO, opt-in, so' Nutry Max (normPlaca continua intocada: Rio
// Quality/Benassi nao passam por aqui):
//  - canonizacao visual so' onde o padrao de placa brasileiro FORCA o tipo:
//    posicoes 1-3 sempre letra (0->O, 1->I), posicoes 4, 6 e 7 sempre digito
//    (O->0, I->1). Posicao 5 (letra no Mercosul, digito no antigo) NUNCA e'
//    tocada -- RQO9O37 e RQO9037 sao placas reais distintas. Placa valida
//    canoniza nela mesma, logo duas placas VALIDAS distintas nunca colidem.
//  - so' casa placa da escala com variante da FROTA da propria empresa, e so'
//    quando uma das duas grafias e' invalida (nao pode ser outro veiculo).
//  - variante que tambem aparece na escala nao e' absorvida (loga).
//  - com cadastro duplicado (grafia exata E variante na frota, caso real
//    RQO9H37), a grafia consultada e' escolhida por SINAL NO DIA na ponte do
//    monitoramento (mais km, depois mais paradas; empate = grafia do
//    romaneio) -- assim um dia anterior a 28/09 continua usando o cv antigo.
// So' O/0 e I/1: os dados mostraram O/0 (Nutry Max RQ0-9H37) e I/1 (Benassi
// LNN-IJ66); nenhum B/8 real.
import { buscarHorariosBase, type HorarioBase, type PontoEntregaBridge } from './base-horarios'

/** placa da escala (normalizada) -> grafias (normalizadas) da frota que sao o mesmo veiculo */
export type AliasPlacas = Map<string, string[]>

const PADRAO_PLACA = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/
const DIGITO_PARA_LETRA: Record<string, string> = { '0': 'O', '1': 'I' }
const LETRA_PARA_DIGITO: Record<string, string> = { O: '0', I: '1' }

export function placaValida(p: string): boolean {
  return PADRAO_PLACA.test(p)
}

/** Recebe placa ja' normalizada (normPlaca). Tamanho != 7 volta igual. */
export function placaCanonicaVisual(p: string): string {
  if (p.length !== 7) return p
  const c = p.split('')
  for (const i of [0, 1, 2]) c[i] = DIGITO_PARA_LETRA[c[i]] ?? c[i]
  for (const i of [3, 5, 6]) c[i] = LETRA_PARA_DIGITO[c[i]] ?? c[i]
  return c.join('')
}

export function resolverAliasPlacas(placasEscala: string[], frotaNorm: string[]): AliasPlacas {
  const alias: AliasPlacas = new Map()
  const escala = new Set(placasEscala)
  const frotaPorCanonica = new Map<string, string[]>()
  for (const f of new Set(frotaNorm)) {
    const c = placaCanonicaVisual(f)
    frotaPorCanonica.set(c, [...(frotaPorCanonica.get(c) ?? []), f])
  }
  for (const p of escala) {
    if (p.length !== 7) continue
    const variantes = (frotaPorCanonica.get(placaCanonicaVisual(p)) ?? []).filter(f => f !== p)
    const aceitas: string[] = []
    for (const f of variantes) {
      if (escala.has(f)) {
        console.warn(`[alias-placa] ${p} ~ ${f}: as duas grafias estao na escala, nao unifica`)
        continue
      }
      if (placaValida(p) && placaValida(f)) {
        console.warn(`[alias-placa] ${p} ~ ${f}: duas placas validas distintas, nao unifica`)
        continue
      }
      aceitas.push(f)
    }
    if (aceitas.length === 0) continue
    alias.set(p, aceitas)
    const duplicado = frotaNorm.includes(p) ? ' (cadastro duplicado na frota: grafia exata tambem existe)' : ''
    console.warn(`[alias-placa] ${p} casa com a frota por ${aceitas.join(', ')}${duplicado}`)
  }
  return alias
}

/** Grafias da frota absorvidas por alguma placa da escala. */
export function placasAliasDaFrota(alias: AliasPlacas): Set<string> {
  return new Set([...alias.values()].flat())
}

/** Conjunto (ex. declaracao manual sem rastreador) na grafia da frota passa a valer pra placa da escala. */
export function aplicarAliasEmConjunto(conjunto: Set<string>, alias: AliasPlacas): Set<string> {
  const out = new Set(conjunto)
  for (const [p, variantes] of alias) if (variantes.some(v => conjunto.has(v))) out.add(p)
  return out
}

function sinal(h: HorarioBase | undefined): [number, number] {
  if (!h) return [-2, -1]
  return [h.kmPercorrido ?? -1, h.paradas?.length ?? 0]
}

/** Revisao 30/09 (B1): a grafia foi consultada com sucesso? So' da' pra
 *  saber no modo `incluirParadas` (consultaPosicoesOk); ausente do mapa =
 *  lote com erro/timeout (buscarLote devolve vazio) ou placa sem resposta. */
function consultaFalhou(h: HorarioBase | undefined, incluirParadas: boolean): boolean {
  if (!h) return true
  return incluirParadas && h.consultaPosicoesOk !== true
}

function descreverSinal(g: string, h: HorarioBase | undefined, incluirParadas: boolean): string {
  if (consultaFalhou(h, incluirParadas)) return `${g} consulta falhou`
  return `${g} km ${h!.kmPercorrido ?? '-'}, ${h!.paradas?.length ?? 0} paradas`
}

/** buscarHorariosBase consultando tambem as variantes da frota; devolve o
 *  mapa chaveado SO' pela placa da escala (grafia com sinal no dia vence) e
 *  `consulta` (placa da escala -> grafia escolhida, so' pras que tem alias).
 *  Revisao 30/09 (B1): as variantes vao no MESMO lote da placa (falha de
 *  lote nunca atinge so' uma grafia) e, se a consulta de QUALQUER grafia do
 *  grupo falhou, o resultado fica `consultaPosicoesOk=false` (nunca conclui
 *  "sem sinal" escolhendo o cv morto por falta de resposta do outro). */
export async function buscarHorariosBaseComAlias(
  placasNorm: string[],
  data: string,
  pontosPorPlaca: Map<string, PontoEntregaBridge[]>,
  incluirParadas: boolean,
  alias: AliasPlacas,
): Promise<{ horarios: Map<string, HorarioBase>; consulta: Map<string, string> }> {
  const pontos = new Map(pontosPorPlaca)
  for (const [p, variantes] of alias) {
    const pts = pontosPorPlaca.get(p)
    if (pts) for (const v of variantes) pontos.set(v, pts)
  }
  // Cada variante logo depois da placa dela; `juntasCom` (alias) garante que
  // a borda do lote nunca separa as grafias.
  const ordem = [...placasNorm.flatMap(p => [p, ...(alias.get(p) ?? [])]), ...[...alias].filter(([p]) => !placasNorm.includes(p)).flatMap(([, vs]) => vs)]
  const bruto = alias.size > 0
    ? await buscarHorariosBase([...new Set(ordem)], data, pontos, incluirParadas, undefined, alias)
    : await buscarHorariosBase(placasNorm, data, pontos, incluirParadas)
  const consulta = new Map<string, string>()
  for (const [p, variantes] of alias) {
    const grafias = [p, ...variantes]
    let melhor = p
    for (const v of variantes) {
      const [kmV, parV] = sinal(bruto.get(v))
      const [kmM, parM] = sinal(bruto.get(melhor))
      if (kmV > kmM || (kmV === kmM && parV > parM)) melhor = v
    }
    consulta.set(p, melhor)
    const falhas = grafias.filter(g => consultaFalhou(bruto.get(g), incluirParadas))
    const resumo = grafias.map(g => descreverSinal(g, bruto.get(g), incluirParadas)).join(' | ')
    const h = bruto.get(melhor)
    if (h) {
      if (falhas.length > 0) {
        bruto.set(p, { ...h, ...(incluirParadas ? { consultaPosicoesOk: false } : {}) })
        console.warn(`[alias-placa] ${p}: consulta de ${falhas.join(', ')} falhou -- usando ${melhor} so' com o que respondeu, consulta NAO ok (nunca conclui sem sinal) [${resumo}]`)
      } else {
        bruto.set(p, h)
        console.warn(`[alias-placa] ${p}: consulta ${melhor} (${melhor === p ? 'empate ou mais sinal: grafia do romaneio' : 'mais sinal no dia'}) [${resumo}]`)
      }
    } else {
      bruto.delete(p)
      console.warn(`[alias-placa] ${p}: consulta de todas as grafias falhou [${resumo}]`)
    }
    for (const v of variantes) bruto.delete(v)
  }
  return { horarios: bruto, consulta }
}

/** placaNorm -> cv da frota; placa da escala com alias usa o cv da grafia
 *  escolhida por buscarHorariosBaseComAlias (`consulta`). */
export function montarCvPorPlaca(frota: { cv: string; placaNorm: string }[], consulta: Map<string, string>): Map<string, string> {
  const cvPorPlaca = new Map(frota.map(v => [v.placaNorm, v.cv]))
  for (const [p, grafia] of consulta) {
    const cv = cvPorPlaca.get(grafia)
    if (cv) cvPorPlaca.set(p, cv)
  }
  return cvPorPlaca
}
