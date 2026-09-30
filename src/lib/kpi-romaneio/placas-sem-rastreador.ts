// Task 8 (plano 2026-09-24-melhorias-relatorio-final-ana): placa declarada SEM
// RASTREADOR pela OPERACAO, nao pelo dado GPS -- caso TTL5J17: tem `cv` na
// Unitrac e paradas so' na BASE, o que pelo dado e' indistinguivel de caminhao
// parado (cai em "VEICULO SEM MOVIMENTO"). A informacao "sem rastreador" so'
// existe porque a operacao avisou (Ana, 24/09) -- persistida em
// `kpi_placa_sem_rastreador` (ver migration) com vigencia (inicio/fim).
//
// A declaracao manual VENCE qualquer fonte de dado: quando a placa esta no
// conjunto do dia, `temRastreador` sai `false` mesmo que `cv`/ponte digam que
// sim -- mesmo rotulo e mesmo comportamento (fora da taxa automatica) da Task 1
// (`SEM RASTREADOR - VEÍCULO SEM RASTREAMENTO NO DIA - NÃO CONTABILIZADO`).
import { createServiceClient } from '@/lib/supabase/service'
import { normPlaca } from '@/lib/unitrac-api'
import { PLACA_GENERICA_SEM_RASTREADOR } from './constants'
import type { HorarioBase } from './base-horarios'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'

/** Formato exato da linha em `kpi_placa_sem_rastreador` (colunas da migration,
 *  snake_case -- o que o PostgREST devolve de `select('*')`). */
export type PlacaSemRastreadorRow = {
  id: number
  empresa: string
  placa: string
  inicio: string // date 'YYYY-MM-DD'
  fim: string | null // date 'YYYY-MM-DD', null = sem previsao de volta
  motivo: string | null
  responsavel: string
  criado_em: string // ISO
}

/** Placas (normalizadas) declaradas sem rastreador NO DIA `data`. Vigencia
 *  fechada: `inicio <= data` e (`fim` null ou `fim >= data`). Comparacao
 *  lexicografica de strings ISO 'YYYY-MM-DD' equivale a comparacao de data. */
export function placasSemRastreadorNoDia(linhas: PlacaSemRastreadorRow[], data: string): Set<string> {
  const placas = new Set<string>()
  for (const l of linhas) {
    if (l.inicio > data) continue
    if (l.fim != null && l.fim < data) continue
    placas.add(normPlaca(l.placa))
  }
  return placas
}

/** Le o cadastro de placas sem rastreador da empresa. Falha de leitura (tabela
 *  ainda nao existe ate' o deploy da migration, Supabase fora do ar, etc) NAO
 *  quebra a geracao -- devolve vazio (nenhuma placa declarada), mesmo padrao
 *  fail-open de `alvosEfetivos` (alvos-snapshot.ts). */
export async function buscarPlacasSemRastreador(empresa: string): Promise<PlacaSemRastreadorRow[]> {
  try {
    const { data: linhas, error } = await createServiceClient()
      .from('kpi_placa_sem_rastreador')
      .select('*')
      .eq('empresa', empresa)
    if (error) throw new Error(error.message)
    return (linhas ?? []) as PlacaSemRastreadorRow[]
  } catch (err) {
    console.error('placas sem rastreador indisponivel:', err)
    return []
  }
}

/** Helper puro (usado por route.ts e pelo CLI `gerar-nutrimax-real-arquivo.ts`
 *  -- ambos montavam o mesmo calculo duplicado) que monta o mapa final de
 *  `temRastreadorPorPlaca`: comeca do calculo de hoje (cv na Unitrac OU
 *  entrada na ponte do monitoramento) e por cima aplica a declaracao manual da
 *  operacao, que VENCE qualquer fonte de dado (TTL5J17: tem `cv` e a ponte
 *  respondeu, mas a operacao confirmou que a placa nao tem rastreador no dia
 *  -- sem isso cairia em "VEICULO SEM MOVIMENTO"). */
export function montarTemRastreadorPorPlaca(
  placasNorm: string[],
  cvPorPlaca: Map<string, unknown>,
  horarioBasePorPlaca: Map<string, unknown>,
  placasSemRastreador: Set<string>,
  // 29/09: deteccao automatica SEM SINAL NO DIA (ver placaSemSinalNoDia) --
  // mesmo efeito da declaracao manual. Default vazio = comportamento antigo.
  placasSemSinal: Set<string> = new Set(),
): Map<string, boolean> {
  return new Map(placasNorm.map(p => [
    p,
    // Achado real 26/09 (grupo, KPI de 25/09): XXX0000 nao e' veiculo -- vence
    // qualquer fonte de dado, mesmo padrao da declaracao manual acima (e
    // roda ANTES dela: nao precisa de cadastro em kpi_placa_sem_rastreador
    // pra uma placa que nunca vai ser real).
    p === PLACA_GENERICA_SEM_RASTREADOR || placasSemRastreador.has(p) || placasSemSinal.has(p)
      ? false
      : (cvPorPlaca.has(p) || horarioBasePorPlaca.has(p)),
  ]))
}

/** 29/09 (ordem direta do usuario, KPI-Nutry-Max-2026-09-29: RQV8J31 fora da
 *  frota do monitoramento, RQU5J45 nunca transmitiu, RQO9H37 com 0 posicoes
 *  no dia -- saiam "AGUARDANDO" / "em rota"). Definicao objetiva de SEM SINAL
 *  NO DIA, so' com o que ja chega ao KPI (a ponte nao expoe contagem de
 *  posicoes; nada mudou no monitoramento):
 *
 *  - a ponte RESPONDEU pela placa (sem entrada = ponte fora do ar/erro: nao
 *    conclui nada, fail-safe), E
 *  - `kmPercorrido === null` -- a ponte so' devolve null com MENOS DE 2
 *    posicoes no dia (calcularKmContinuo; com >=2 leituras, mesmo paradas no
 *    mesmo ponto, devolve numero, ex. 0 km da RQU6E83 = NAO SAIU DA BASE), E
 *  - nem saida nem chegada na base, nenhuma parada derivada pela ponte e
 *    nenhuma visita com menorDistanciaM calculada (tudo isso exige posicao), E
 *  - nenhuma parada FORA_BASE crua da Unitrac da propria placa (parada so' na
 *    BASE e' irrelevante: e' o caso RQO9H37, parada do dia anterior na base
 *    ainda aberta), E
 *  - nenhum alvo Unitrac 'feito' (situacao 1) da placa no dia.
 *
 *  Vale com o dia encerrado OU em andamento: sem nenhuma posicao ate' agora
 *  nao e' "aguardando". Opt-in: so' os chamadores Nutry Max (route.ts +
 *  scripts/gerar-nutrimax-real-arquivo.ts) usam. */
export function placaSemSinalNoDia(
  horario: HorarioBase | undefined,
  paradasUnitracCruas: UnitracParadaRow[],
  alvosDaPlaca: { situacao?: number | null }[],
): boolean {
  if (!horario) return false
  if (horario.kmPercorrido !== null) return false
  if (horario.saidaBase != null || horario.chegadaBase != null) return false
  if ((horario.paradas?.length ?? 0) > 0) return false
  for (const v of horario.visitasPorNf?.values() ?? []) {
    if (typeof v.menorDistanciaM === 'number' || v.chegada != null) return false
  }
  if (paradasUnitracCruas.some(p => p.classificacao !== 'BASE')) return false
  if (alvosDaPlaca.some(a => a.situacao === 1)) return false
  return true
}

/** Conjunto das placas da escala SEM SINAL NO DIA (ver placaSemSinalNoDia). */
export function placasSemSinalNoDia(
  placasNorm: string[],
  horarioBasePorPlaca: Map<string, HorarioBase>,
  paradasUnitracCruasPorPlaca: Map<string, UnitracParadaRow[]>,
  alvosPorPlaca: Map<string, { situacao?: number | null }[]>,
): Set<string> {
  return new Set(placasNorm.filter(p => placaSemSinalNoDia(
    horarioBasePorPlaca.get(p), paradasUnitracCruasPorPlaca.get(p) ?? [], alvosPorPlaca.get(p) ?? [],
  )))
}
