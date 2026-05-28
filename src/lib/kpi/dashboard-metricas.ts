import type { EntradaManual, StatusManual } from './parse-kpi-manual'

export interface Filtro {
  redes?: string[]
  de?: string
  ate?: string
  status?: StatusManual
}

export function filtrar(ents: EntradaManual[], f: Filtro): EntradaManual[] {
  return ents.filter(e =>
    (!f.redes || f.redes.length === 0 || f.redes.includes(e.rede_id)) &&
    (!f.de || e.data >= f.de) &&
    (!f.ate || e.data <= f.ate) &&
    (!f.status || e.status === f.status),
  )
}

export interface MetricasRede {
  rede_id: string
  total: number
  entregue: number
  nao_foi: number
  sem_rastreador: number
  pctEntregue: number
  tempoMedioMin: number | null
}
export interface PontoSerie {
  data: string
  entregue: number
  nao_foi: number
  sem_rastreador: number
  total: number
}
export interface Metricas {
  total: number
  entregue: number
  nao_foi: number
  sem_rastreador: number
  com_rastreador: number
  pctEntregue: number
  pctSemRastreador: number
  tempoMedioLojaMin: number | null
  turnos: { madrugada: number; manha: number; tarde: number; noite: number }
  porRede: MetricasRede[]
  rankingSucesso: MetricasRede[]
  rankingSemRastreador: MetricasRede[]
  serie: PontoSerie[]
  topSemRastreador: Array<{ rede_id: string; loja: string; ocorrencias: number }>
  topNaoFoi: Array<{ rede_id: string; loja: string; ocorrencias: number }>
  placasMaisAtivas: Array<{ placa: string; entregas: number }>
}

function diffMin(chd: string | null, sai: string | null): number | null {
  if (!chd || !sai) return null
  const [ch, cm] = chd.split(':').map(Number)
  const [sh, sm] = sai.split(':').map(Number)
  let d = (sh * 60 + sm) - (ch * 60 + cm)
  if (d < 0) d += 1440
  return d
}
function mediaTempo(es: EntradaManual[]): number | null {
  const t = es.filter(e => e.status === 'entregue').map(e => diffMin(e.chd, e.sai)).filter((n): n is number => n != null)
  return t.length ? Math.round(t.reduce((a, b) => a + b, 0) / t.length) : null
}
function turno(chd: string | null): keyof Metricas['turnos'] | null {
  if (!chd) return null
  const h = Number(chd.split(':')[0])
  return h < 6 ? 'madrugada' : h < 12 ? 'manha' : h < 18 ? 'tarde' : 'noite'
}

export function calcularMetricas(ents: EntradaManual[]): Metricas {
  const cont = (s: StatusManual) => ents.filter(e => e.status === s).length
  const total = ents.length
  const entregue = cont('entregue')
  const nao_foi = cont('nao_foi')
  const sem_rastreador = cont('sem_rastreador')

  const turnos = { madrugada: 0, manha: 0, tarde: 0, noite: 0 }
  for (const e of ents) { const t = turno(e.chd); if (t) turnos[t]++ }

  const redeMap = new Map<string, EntradaManual[]>()
  for (const e of ents) { const a = redeMap.get(e.rede_id) ?? []; a.push(e); redeMap.set(e.rede_id, a) }
  const porRede: MetricasRede[] = [...redeMap.entries()].map(([rede_id, es]) => {
    const en = es.filter(e => e.status === 'entregue').length
    return {
      rede_id, total: es.length, entregue: en,
      nao_foi: es.filter(e => e.status === 'nao_foi').length,
      sem_rastreador: es.filter(e => e.status === 'sem_rastreador').length,
      pctEntregue: es.length ? Math.round(100 * en / es.length) : 0,
      tempoMedioMin: mediaTempo(es),
    }
  })

  const serieMap = new Map<string, PontoSerie>()
  for (const e of ents) {
    const p = serieMap.get(e.data) ?? { data: e.data, entregue: 0, nao_foi: 0, sem_rastreador: 0, total: 0 }
    p[e.status]++; p.total++
    serieMap.set(e.data, p)
  }

  const agrupaLoja = (st: StatusManual) => {
    const m = new Map<string, { rede_id: string; loja: string; ocorrencias: number }>()
    for (const e of ents) if (e.status === st) {
      const k = `${e.rede_id}|${e.loja}`
      const x = m.get(k) ?? { rede_id: e.rede_id, loja: e.loja, ocorrencias: 0 }
      x.ocorrencias++; m.set(k, x)
    }
    return [...m.values()].sort((a, b) => b.ocorrencias - a.ocorrencias).slice(0, 20)
  }

  const placaMap = new Map<string, number>()
  for (const e of ents) if (e.status === 'entregue' && e.placa) placaMap.set(e.placa, (placaMap.get(e.placa) ?? 0) + 1)

  return {
    total, entregue, nao_foi, sem_rastreador, com_rastreador: entregue + nao_foi,
    pctEntregue: total ? Math.round(100 * entregue / total) : 0,
    pctSemRastreador: total ? Math.round(100 * sem_rastreador / total) : 0,
    tempoMedioLojaMin: mediaTempo(ents),
    turnos,
    porRede: porRede.sort((a, b) => b.total - a.total),
    rankingSucesso: [...porRede].sort((a, b) => b.pctEntregue - a.pctEntregue),
    rankingSemRastreador: [...porRede].sort((a, b) => b.sem_rastreador - a.sem_rastreador),
    serie: [...serieMap.values()].sort((a, b) => a.data.localeCompare(b.data)),
    topSemRastreador: agrupaLoja('sem_rastreador'),
    topNaoFoi: agrupaLoja('nao_foi'),
    placasMaisAtivas: [...placaMap.entries()].map(([placa, entregas]) => ({ placa, entregas })).sort((a, b) => b.entregas - a.entregas).slice(0, 15),
  }
}
