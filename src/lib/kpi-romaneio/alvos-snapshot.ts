import { createServiceClient } from '@/lib/supabase/service'
import type { AlvoApi } from '@/lib/unitrac-api'
import { placaCanonicaAlias } from './alias-placa'

// Revisao 30/09 (B2): o cron noturno grava com a grafia da FROTA (RQ09H37) e
// o KPI consulta pela da escala (RQO9H37). Snapshot e mescla usam a placa
// canonica do alias da Nutry Max (placaCanonicaAlias) -- chave unica por
// dia, sem reescrever snapshots antigos (canoniza tambem na leitura).
export function canonizarPlacasDosAlvos(alvos: AlvoApi[]): AlvoApi[] {
  return alvos.map(a => {
    const c = placaCanonicaAlias(a.placaNorm)
    return c === a.placaNorm ? a : { ...a, placaNorm: c }
  })
}

/** Alvos na grafia da escala: placa fora da escala cuja canonica bate com a
 *  de uma placa da escala passa a usar a grafia da escala. */
export function alvosNaGrafiaDaEscala(alvos: AlvoApi[], placasEscala: string[]): AlvoApi[] {
  const escala = new Set(placasEscala)
  const porCanonica = new Map(placasEscala.map(p => [placaCanonicaAlias(p), p]))
  return alvos.map(a => {
    if (escala.has(a.placaNorm)) return a
    const p = porCanonica.get(placaCanonicaAlias(a.placaNorm))
    return p ? { ...a, placaNorm: p } : a
  })
}

const chave = (a: AlvoApi) => `${a.placaNorm}|${a.codigoUnitrac}|${a.documento ?? ''}|${a.ordem}`

export function mesclarAlvos(antigosBrutos: AlvoApi[], novosBrutos: AlvoApi[]): AlvoApi[] {
  const antigos = canonizarPlacasDosAlvos(antigosBrutos)
  const novos = canonizarPlacasDosAlvos(novosBrutos)
  const mapa = new Map<string, AlvoApi>()
  for (const a of antigos) mapa.set(chave(a), a)
  for (const a of novos) {
    const atual = mapa.get(chave(a))
    if (atual && atual.situacao === 1 && a.situacao !== 1) continue
    mapa.set(chave(a), a)
  }
  // consumidores fazem Map por NF (last-wins): feitos por ultimo para vencerem se `ordem` mudou entre capturas
  return [...mapa.values()].sort((a, b) => Number(a.situacao === 1) - Number(b.situacao === 1))
}

export async function lerSnapshotAlvos(cliente: string, data: string): Promise<AlvoApi[] | null> {
  const { data: row, error } = await createServiceClient()
    .from('kpi_alvos_snapshot').select('alvos')
    .eq('cliente', cliente).eq('data_referencia', data).maybeSingle()
  if (error) throw new Error(error.message)
  return row ? canonizarPlacasDosAlvos(row.alvos as AlvoApi[]) : null
}

export async function salvarSnapshotAlvos(cliente: string, data: string, alvos: AlvoApi[]): Promise<void> {
  const existente = await lerSnapshotAlvos(cliente, data)
  const final = mesclarAlvos(existente ?? [], alvos)
  const { error } = await createServiceClient().from('kpi_alvos_snapshot').upsert({
    cliente, data_referencia: data, capturado_em: new Date().toISOString(),
    qtd_alvos: final.length, alvos: final,
  })
  if (error) throw new Error(error.message)
}

/** Alvos efetivos do dia: hoje → grava a API no snapshot; dia passado → API mesclada com o snapshot.
 *  `placasEscala` (opcional): devolve os alvos na grafia da escala (ver alvosNaGrafiaDaEscala). */
export async function alvosEfetivos(cliente: string, data: string, hoje: string, daApi: AlvoApi[], placasEscala?: string[]): Promise<AlvoApi[]> {
  const naEscala = (alvos: AlvoApi[]) => (placasEscala ? alvosNaGrafiaDaEscala(alvos, placasEscala) : alvos)
  try {
    if (data >= hoje && daApi.length > 0) {
      await salvarSnapshotAlvos(cliente, data, daApi)
      console.log(`snapshot alvos ${data}: 0 do snapshot + ${daApi.length} da API (gravado)`)
      return naEscala(daApi)
    }
    const snap = await lerSnapshotAlvos(cliente, data)
    if (!snap) {
      console.log(`sem snapshot para ${data}`)
      return naEscala(daApi)
    }
    console.log(`snapshot alvos ${data}: ${snap.length} do snapshot + ${daApi.length} da API`)
    // hoje com API vazia: devolve o snapshot; dia passado: mescla
    return naEscala(data >= hoje ? snap : mesclarAlvos(snap, daApi))
  } catch (err) {
    console.error('snapshot de alvos indisponível:', err)
    return naEscala(daApi)
  }
}

/** Agrupa alvos por dia (feitoISO ?? inicioISO); alvos sem nenhuma data são ignorados. */
export function agruparAlvosPorDia(alvos: AlvoApi[]): Map<string, AlvoApi[]> {
  const porDia = new Map<string, AlvoApi[]>()
  for (const a of alvos) {
    const iso = a.feitoISO ?? a.inicioISO
    if (!iso) continue
    const dia = iso.slice(0, 10)
    const lista = porDia.get(dia)
    if (lista) lista.push(a)
    else porDia.set(dia, [a])
  }
  return porDia
}
