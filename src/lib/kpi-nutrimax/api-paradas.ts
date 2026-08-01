import { buscarFrota } from '@/lib/unitrac-api/frota'
import { buscarPontos } from '@/lib/unitrac-api/pontos'
import { buscarStopsCru, consolidaParadasApi } from '@/lib/unitrac-api/consolida'
import { COD_USER_NUTRIMAX } from '@/lib/unitrac-api/client'
import { mesclarParadas } from '@/lib/kpi/merge-paradas'
import { mapLimitSettled } from '@/lib/utils/map-limit'
import type { ResumoVeiculo, ParadaUnitrac, ClassificacaoParada } from '@/lib/types/unitrac'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import { BASES_COORD_NUTRIMAX, MARCADOR_BASE_NUTRIMAX } from './constants'

const HORAS_JANELA = 48
const CONCORRENCIA = 8

function unitracRowToParada(row: UnitracParadaRow): ParadaUnitrac {
  return {
    placa_norm: row.placa_norm,
    chegada: new Date(row.chegada),
    saida: row.saida ? new Date(row.saida) : new Date(row.chegada),
    duracao_seg: row.duracao_seg ?? 0,
    // API ao vivo não devolve distância por parada — só o PDF tem esse dado.
    distancia_km: null,
    endereco: row.endereco ?? null,
    lat: row.lat,
    lng: row.lng,
    // consolidaParadasApi grava "BASE BENASSI - BASE BENASSI" pra paradas BASE
    // (hardcoded lá, módulo compartilhado com o Benassi) — corrige aqui na borda
    // pra não vazar o nome errado no output da Nutry Max.
    local_parada: row.classificacao === 'BASE' ? MARCADOR_BASE_NUTRIMAX : row.local_parada,
    codigo_loja: row.codigo_loja,
    nome_loja: row.nome_loja,
    classificacao: row.classificacao as ClassificacaoParada,
    ordem: row.ordem,
  }
}

function paradaToUnitracRow(p: ParadaUnitrac, idx: number): UnitracParadaRow {
  return {
    id: `${p.placa_norm}-${idx}`,
    placa_norm: p.placa_norm,
    chegada: p.chegada.toISOString(),
    saida: p.saida.toISOString(),
    duracao_seg: p.duracao_seg,
    local_parada: p.local_parada,
    codigo_loja: p.codigo_loja,
    nome_loja: p.nome_loja,
    lat: p.lat,
    lng: p.lng,
    endereco: p.endereco,
    classificacao: p.classificacao,
    ordem: p.ordem,
  }
}

function agrupaResumosPorPlaca(rows: UnitracParadaRow[]): ResumoVeiculo[] {
  const porPlaca = new Map<string, UnitracParadaRow[]>()
  for (const r of rows) {
    const arr = porPlaca.get(r.placa_norm) ?? []
    arr.push(r)
    porPlaca.set(r.placa_norm, arr)
  }
  const out: ResumoVeiculo[] = []
  for (const [placa_norm, group] of porPlaca) {
    const ordenado = [...group].sort((a, b) => new Date(a.chegada).getTime() - new Date(b.chegada).getTime())
    const paradas = ordenado.map((r, i) => ({ ...unitracRowToParada(r), ordem: i + 1 }))
    out.push({
      placa_norm,
      placa_raw: placa_norm,
      inicio_viagem: paradas.length > 0 ? paradas[0].chegada : null,
      fim_viagem: paradas.length > 0 ? paradas[paradas.length - 1].saida : null,
      qtd_paradas: paradas.length,
      saida_cd: null,
      paradas,
    })
  }
  return out
}

/** O Relatório Parada e Serviço em PDF costuma cobrir uma janela de vários
 *  dias (ex: relatorio_51246.pdf trouxe 30/07 E 31/07 no mesmo arquivo) —
 *  `parseUnitracPdf` não filtra por data, devolve TODAS as paradas de cada
 *  placa no PDF inteiro num único ResumoVeiculo. Gerando o KPI/Romaneio de
 *  um dia específico, isso conta parada(s) de outro dia como se fossem
 *  desse dia (verificado: 81 de 89 placas em relatorio_51246.pdf tinham
 *  paradas de 30/07 misturadas com as de 31/07 — normalmente 1 parada
 *  perdida, o suficiente pra inflar km/qtd_paradas e aparecer como "parada
 *  sem cliente correspondente" no Romaneio). `inicio_viagem`/`fim_viagem`
 *  NÃO são recalculados aqui — vêm de "Início/Fim Viagem" do próprio
 *  cabeçalho do Unitrac no PDF (autoritativo, sem granularidade por parada
 *  pra filtrar; ver nota em constants.ts sobre não tentar recalcular isso). */
export function filtraResumosPorDia(resumos: ResumoVeiculo[], data: string): ResumoVeiculo[] {
  return resumos.map(r => {
    const paradas = r.paradas
      .filter(p => p.chegada.toISOString().slice(0, 10) === data)
      .map((p, i) => ({ ...p, ordem: i + 1 }))
    return { ...r, paradas, qtd_paradas: paradas.length }
  })
}

/** Busca as paradas ao vivo da API do Unitrac pras placas da escala, no
 *  mesmo formato ResumoVeiculo[] que parseUnitracPdf produz — o resto do
 *  pipeline da Nutry Max (montaResumoViagemPorPlaca, montaKpiViagemPorCarga)
 *  não precisa saber de onde os dados vieram. */
export async function buscarResumosViagemViaApi(
  placasEscala: ReadonlySet<string>,
  data: string,
): Promise<ResumoVeiculo[]> {
  const frota = await buscarFrota(COD_USER_NUTRIMAX)
  const veiculosEscala = frota.filter(v => placasEscala.has(v.placaNorm))
  if (veiculosEscala.length === 0) return []

  const cvs = veiculosEscala.map(v => v.cv)
  const pontos = await buscarPontos(cvs)

  const settled = await mapLimitSettled(veiculosEscala, CONCORRENCIA, (v) =>
    buscarStopsCru(v.cv, HORAS_JANELA).then(eventos =>
      consolidaParadasApi(eventos, pontos, data, v.placaNorm, BASES_COORD_NUTRIMAX)))

  const rows: UnitracParadaRow[] = []
  for (const r of settled) if (r.status === 'fulfilled') rows.push(...r.value)

  return agrupaResumosPorPlaca(rows)
}

/** Mescla paradas do PDF (autoritativas) com as da API (ao vivo), igual ao
 *  Benassi: só adiciona da API o que o PDF ainda não tem (dedup por
 *  coordenada+janela de tempo, via mesclarParadas). */
export function mesclarResumosPdfApi(
  pdfResumos: ResumoVeiculo[],
  apiResumos: ResumoVeiculo[],
): ResumoVeiculo[] {
  const apiPorPlaca = new Map(apiResumos.map(r => [r.placa_norm, r]))
  const usadas = new Set<string>()

  const out: ResumoVeiculo[] = pdfResumos.map(pdfR => {
    const apiR = apiPorPlaca.get(pdfR.placa_norm)
    if (!apiR) return pdfR
    usadas.add(pdfR.placa_norm)

    // UnitracParadaRow não tem campo distancia_km — guarda à parte por id (com
    // índices deslocados pra pdf/api nunca colidirem) pra não perder o km do PDF
    // na conversão de ida e volta.
    const distanciaPorId = new Map<string, number | null>()
    const pdfRows = pdfR.paradas.map((p, i) => {
      const row = paradaToUnitracRow(p, i)
      distanciaPorId.set(row.id, p.distancia_km)
      return row
    })
    const apiRows = apiR.paradas.map((p, i) => {
      const row = paradaToUnitracRow(p, i + pdfR.paradas.length)
      distanciaPorId.set(row.id, p.distancia_km)
      return row
    })
    const mescladas = mesclarParadas(pdfRows, apiRows)
    const paradas = mescladas
      .map(r => ({ ...unitracRowToParada(r), distancia_km: distanciaPorId.get(r.id) ?? null }))
      .sort((a, b) => a.chegada.getTime() - b.chegada.getTime())
      .map((p, i) => ({ ...p, ordem: i + 1 }))

    return { ...pdfR, paradas, qtd_paradas: paradas.length }
  })

  for (const apiR of apiResumos) {
    if (!usadas.has(apiR.placa_norm)) out.push(apiR)
  }
  return out
}
