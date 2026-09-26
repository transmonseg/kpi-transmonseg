import { createServiceClient } from '@/lib/supabase/service'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import { haversine } from '@/lib/utils/geo'

// Fix round 1 (revisão da Task 7): dedupe por `chegada` EXATA quebrava quando
// a mesma parada física reaparecia numa captura posterior com `chegada`
// diferente -- o 1º evento cru do cluster (consolida.ts) pode ter saído da
// janela de 48h da Unitrac entre duas capturas, então o cluster "perde a
// cabeça" e a nova `chegada` é mais tardia que a antiga, mesmo sendo a MESMA
// parada física. Duas entradas são a mesma parada quando as janelas
// [chegada, fimEfetivo] se SOBREPÕEM e os centros estão a ≤50m -- ao mesclar,
// o resultado é a UNIÃO das janelas (início mais antigo, fim mais tardio),
// não a chegada exata de nenhuma das duas.
const RAIO_DEDUPE_M = 50

/** Fim "de verdade" da parada pra fins de janela: fim_real > saida > chegada
 *  (mesma prioridade usada em outros pontos do código pra medir duração real,
 *  ver comentário de `fim_real` em matcher.ts). */
function fimEfetivo(p: UnitracParadaRow): string {
  return p.fim_real ?? p.saida ?? p.chegada
}

function janelasSeSobrepoem(a: UnitracParadaRow, b: UnitracParadaRow): boolean {
  const aIni = new Date(a.chegada).getTime()
  const aFim = new Date(fimEfetivo(a)).getTime()
  const bIni = new Date(b.chegada).getTime()
  const bFim = new Date(fimEfetivo(b)).getTime()
  return aIni <= bFim && bIni <= aFim
}

function centrosPertoDe(a: UnitracParadaRow, b: UnitracParadaRow): boolean {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return false
  return haversine(a.lat, a.lng, b.lat, b.lng) <= RAIO_DEDUPE_M
}

function mesmaParada(a: UnitracParadaRow, b: UnitracParadaRow): boolean {
  return janelasSeSobrepoem(a, b) && centrosPertoDe(a, b)
}

/** União de duas paradas consideradas a mesma: metadados vêm da que tem a
 *  janela própria mais longa (mais provável de ter o cluster completo), mas
 *  chegada/saida/fim_real viram a UNIÃO das duas janelas -- nunca encolhe. */
function unirDuas(a: UnitracParadaRow, b: UnitracParadaRow): UnitracParadaRow {
  const duracaoMs = (p: UnitracParadaRow) => new Date(fimEfetivo(p)).getTime() - new Date(p.chegada).getTime()
  const base = duracaoMs(a) >= duracaoMs(b) ? a : b
  const chegadaUniao = a.chegada <= b.chegada ? a.chegada : b.chegada
  const fimA = fimEfetivo(a)
  const fimB = fimEfetivo(b)
  const fimUniao = fimA >= fimB ? fimA : fimB
  const saidaUniao = a.saida != null && b.saida != null
    ? (a.saida >= b.saida ? a.saida : b.saida)
    : (a.saida ?? b.saida)
  return {
    ...base,
    chegada: chegadaUniao,
    saida: saidaUniao,
    fim_real: fimUniao,
    duracao_seg: Math.round((new Date(fimUniao).getTime() - new Date(chegadaUniao).getTime()) / 1000),
  }
}

/** União deduplicada de duas listas de paradas da mesma placa, ordenada por
 *  chegada. Fecha em ponto fixo (uma fusão pode fazer a janele unida passar a
 *  sobrepor uma terceira parada que antes não sobrepunha nenhuma das duas). */
export function mesclarParadas(a: UnitracParadaRow[], b: UnitracParadaRow[]): UnitracParadaRow[] {
  let atual = [...a, ...b]
  let mudou = true
  while (mudou) {
    mudou = false
    outer: for (let i = 0; i < atual.length; i++) {
      for (let j = i + 1; j < atual.length; j++) {
        if (mesmaParada(atual[i], atual[j])) {
          const unida = unirDuas(atual[i], atual[j])
          atual = [...atual.slice(0, i), unida, ...atual.slice(i + 1, j), ...atual.slice(j + 1)]
          mudou = true
          break outer
        }
      }
    }
  }
  return atual.sort((x, y) => x.chegada.localeCompare(y.chegada))
}

/** Snapshot salvo (todas as placas) pra uma empresa+data. */
export async function lerSnapshotParadas(empresa: string, data: string): Promise<Map<string, UnitracParadaRow[]>> {
  const { data: linhas, error } = await createServiceClient()
    .from('kpi_paradas_snapshot').select('placa, paradas')
    .eq('empresa', empresa).eq('data', data)
  if (error) throw new Error(error.message)
  const mapa = new Map<string, UnitracParadaRow[]>()
  for (const l of (linhas ?? []) as Array<{ placa: string; paradas: UnitracParadaRow[] }>) {
    mapa.set(l.placa, l.paradas)
  }
  return mapa
}

/** Upsert por placa mesclando com o que já existe no snapshot -- nunca encolhe. */
export async function salvarSnapshotParadas(
  empresa: string,
  data: string,
  porPlaca: Map<string, UnitracParadaRow[]>,
): Promise<void> {
  if (porPlaca.size === 0) return
  const existente = await lerSnapshotParadas(empresa, data)
  const linhas = [...porPlaca].map(([placa, paradas]) => ({
    empresa,
    data,
    placa,
    paradas: mesclarParadas(existente.get(placa) ?? [], paradas),
    atualizado_em: new Date().toISOString(),
  }))
  const { error } = await createServiceClient().from('kpi_paradas_snapshot').upsert(linhas)
  if (error) throw new Error(error.message)
}

/** Paradas efetivas do dia por placa: hoje → grava a API no snapshot e devolve
 *  a API; dia passado → API mesclada com o snapshot (que pode ter mais
 *  paradas do que as 48h que a Unitrac ainda guarda). Falha de leitura/escrita
 *  do snapshot nunca quebra a geração -- loga e devolve a API crua. */
export async function paradasEfetivas(
  empresa: string,
  data: string,
  hoje: string,
  daApiPorPlaca: Map<string, UnitracParadaRow[]>,
  // Achado real 25/09 (ver `unitracCobreODia` em resolverParadas): recebe
  // as placas cujo snapshot do dia passado tinha paradas -- so' pra essas o
  // feed mesclado cobre o dia inteiro fora da janela de 48h da Unitrac.
  placasNoSnapshot?: Set<string>,
): Promise<Map<string, UnitracParadaRow[]>> {
  try {
    if (data >= hoje) {
      await salvarSnapshotParadas(empresa, data, daApiPorPlaca)
      return daApiPorPlaca
    }
    const snap = await lerSnapshotParadas(empresa, data)
    const resultado = new Map<string, UnitracParadaRow[]>()
    for (const [placa, daApi] of daApiPorPlaca) {
      const doSnapshot = snap.get(placa)
      if (doSnapshot && doSnapshot.length > 0) placasNoSnapshot?.add(placa)
      resultado.set(placa, doSnapshot && doSnapshot.length > 0 ? mesclarParadas(doSnapshot, daApi) : daApi)
    }
    return resultado
  } catch (err) {
    console.error('snapshot de paradas indisponível:', err)
    return daApiPorPlaca
  }
}
