import { buscarFrota, buscarAlvos, buscarStopsCru, consolidaParadasApi, type AlvoApi } from '@/lib/unitrac-api'
// UnitracParadaRow é definido em matcher.ts (Benassi), não em unitrac-api --
// consolida.ts importa de lá mas não reexporta.
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import { COD_USER_NUTRIMAX, BASES_COORD_NUTRIMAX } from './constants'

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
  return consolidaParadasApi(eventos, {}, data, placaNorm, BASES_COORD_NUTRIMAX)
}
