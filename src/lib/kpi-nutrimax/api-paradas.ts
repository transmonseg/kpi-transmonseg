import { buscarFrota } from '@/lib/unitrac-api/frota'
import { buscarPontos } from '@/lib/unitrac-api/pontos'
import { buscarStopsCru, consolidaParadasApi } from '@/lib/unitrac-api/consolida'
import { COD_USER_NUTRIMAX } from '@/lib/unitrac-api/client'
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
