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
  tempoMedioRotaMin: number | null
  tempoMedioTotalMin: number | null
  porClienteComTempos: ClienteTempos[]
  topRotasDemoradas: LojaTopRow[]
  topTempoEmLoja: LojaTopRow[]
  topTempoTotal: LojaTopRow[]
  distHorarioSaida: HoraSaidaRow[]
  topMotoristas: MotoristaStat[]
  serieTempos: SerieTempoPonto[]
  matrizDiaRede?: { dias: string[]; redes: Array<{ rede_id: string; celulas: Array<{ pct: number | null; n: number }> }> }
}

export interface ClienteTempos {
  rede_id: string
  entregas: number
  lojas: number
  tempo_rota: number | null
  tempo_loja: number | null
  tempo_total: number | null
  sem_rast: number
}

export interface LojaTopRow {
  rede_id: string
  loja: string
  n: number
  tempo_rota: number | null
  tempo_loja: number | null
  tempo_total: number | null
}

export interface HoraSaidaRow {
  hora: number
  entregas: number
}

export interface MotoristaStat {
  motorista: string
  entregas: number
  tempo_rota: number | null
  tempo_loja: number | null
}

export interface SerieTempoPonto {
  data: string
  tempo_rota: number | null
  tempo_loja: number | null
  tempo_total: number | null
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
function mediaVetorNulo(ns: (number | null)[]): number | null {
  const t = ns.filter((n): n is number => n != null)
  return t.length ? Math.round(t.reduce((a, b) => a + b, 0) / t.length) : null
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

  const entregues = ents.filter(e => e.status === 'entregue')
  const tempoMedioRotaMin = mediaVetorNulo(entregues.map(e => diffMin(e.saida_cd, e.chd)))
  const tempoMedioTotalMin = mediaVetorNulo(entregues.map(e => diffMin(e.saida_cd, e.sai)))

  const porClienteComTempos: ClienteTempos[] = [...redeMap.entries()].map(([rede_id, es]) => {
    const ent = es.filter(e => e.status === 'entregue')
    return {
      rede_id,
      entregas: es.length,
      lojas: new Set(es.map(e => e.loja)).size,
      tempo_rota: mediaVetorNulo(ent.map(e => diffMin(e.saida_cd, e.chd))),
      tempo_loja: mediaVetorNulo(ent.map(e => diffMin(e.chd, e.sai))),
      tempo_total: mediaVetorNulo(ent.map(e => diffMin(e.saida_cd, e.sai))),
      sem_rast: es.filter(e => e.status === 'sem_rastreador').length,
    }
  }).sort((a, b) => b.entregas - a.entregas)

  type LojaAcc = { rede_id: string; loja: string; rotas: number[]; lojas_t: number[]; totais: number[] }
  const lojaMap = new Map<string, LojaAcc>()
  for (const e of entregues) {
    const k = `${e.rede_id}|${e.loja}`
    const cur: LojaAcc = lojaMap.get(k) ?? { rede_id: e.rede_id, loja: e.loja, rotas: [], lojas_t: [], totais: [] }
    const r = diffMin(e.saida_cd, e.chd); if (r != null) cur.rotas.push(r)
    const l = diffMin(e.chd, e.sai);     if (l != null) cur.lojas_t.push(l)
    const t = diffMin(e.saida_cd, e.sai); if (t != null) cur.totais.push(t)
    lojaMap.set(k, cur)
  }
  const todasLojas: LojaTopRow[] = [...lojaMap.values()]
    .filter(v => v.rotas.length >= 2 || v.lojas_t.length >= 2)
    .map(v => ({
      rede_id: v.rede_id, loja: v.loja,
      n: Math.max(v.rotas.length, v.lojas_t.length),
      tempo_rota: mediaVetorNulo(v.rotas),
      tempo_loja: mediaVetorNulo(v.lojas_t),
      tempo_total: mediaVetorNulo(v.totais),
    }))

  const topRotasDemoradas = [...todasLojas]
    .filter(l => l.tempo_rota != null)
    .sort((a, b) => (b.tempo_rota ?? 0) - (a.tempo_rota ?? 0))
    .slice(0, 15)
  const topTempoEmLoja = [...todasLojas]
    .filter(l => l.tempo_loja != null)
    .sort((a, b) => (b.tempo_loja ?? 0) - (a.tempo_loja ?? 0))
    .slice(0, 15)
  const topTempoTotal = [...todasLojas]
    .filter(l => l.tempo_total != null)
    .sort((a, b) => (b.tempo_total ?? 0) - (a.tempo_total ?? 0))
    .slice(0, 15)

  const horaBuckets: HoraSaidaRow[] = Array.from({ length: 24 }, (_, h) => ({ hora: h, entregas: 0 }))
  for (const e of ents) {
    if (!e.saida_cd) continue
    const h = Number(e.saida_cd.split(':')[0])
    if (h >= 0 && h < 24) horaBuckets[h].entregas++
  }

  type MotorAcc = { motorista: string; cnt: number; rotas: number[]; lojas_t: number[] }
  const motorMap = new Map<string, MotorAcc>()
  for (const e of entregues.filter(e => e.motorista)) {
    const k = e.motorista!
    const cur: MotorAcc = motorMap.get(k) ?? { motorista: k, cnt: 0, rotas: [], lojas_t: [] }
    cur.cnt++
    const r = diffMin(e.saida_cd, e.chd); if (r != null) cur.rotas.push(r)
    const l = diffMin(e.chd, e.sai);     if (l != null) cur.lojas_t.push(l)
    motorMap.set(k, cur)
  }
  const topMotoristas: MotoristaStat[] = [...motorMap.values()]
    .sort((a, b) => b.cnt - a.cnt).slice(0, 15)
    .map(v => ({ motorista: v.motorista, entregas: v.cnt, tempo_rota: mediaVetorNulo(v.rotas), tempo_loja: mediaVetorNulo(v.lojas_t) }))

  type SerieTAcc = { rotas: number[]; lojas_t: number[]; totais: number[] }
  const serieTMap = new Map<string, SerieTAcc>()
  for (const e of entregues) {
    const cur: SerieTAcc = serieTMap.get(e.data) ?? { rotas: [], lojas_t: [], totais: [] }
    const r = diffMin(e.saida_cd, e.chd); if (r != null) cur.rotas.push(r)
    const l = diffMin(e.chd, e.sai);     if (l != null) cur.lojas_t.push(l)
    const t = diffMin(e.saida_cd, e.sai); if (t != null) cur.totais.push(t)
    serieTMap.set(e.data, cur)
  }
  const serieTempos: SerieTempoPonto[] = [...serieTMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([data, v]) => ({
      data,
      tempo_rota: mediaVetorNulo(v.rotas),
      tempo_loja: mediaVetorNulo(v.lojas_t),
      tempo_total: mediaVetorNulo(v.totais),
    }))

  // Matriz dia × rede (taxa de entrega) para o heatmap.
  const dmMap = new Map<string, { ent: number; tot: number }>()
  for (const e of ents) {
    const k = `${e.data}|${e.rede_id}`
    const x = dmMap.get(k) ?? { ent: 0, tot: 0 }
    x.tot++; if (e.status === 'entregue') x.ent++
    dmMap.set(k, x)
  }
  const diasMatriz = [...serieMap.keys()].sort((a, b) => a.localeCompare(b))
  const matrizDiaRede = {
    dias: diasMatriz,
    redes: [...porRede].sort((a, b) => b.total - a.total).map(r => ({
      rede_id: r.rede_id,
      celulas: diasMatriz.map(d => {
        const x = dmMap.get(`${d}|${r.rede_id}`)
        return x && x.tot > 0 ? { pct: Math.round(100 * x.ent / x.tot), n: x.tot } : { pct: null, n: 0 }
      }),
    })),
  }

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
    tempoMedioRotaMin,
    tempoMedioTotalMin,
    porClienteComTempos,
    topRotasDemoradas,
    topTempoEmLoja,
    topTempoTotal,
    distHorarioSaida: horaBuckets,
    topMotoristas,
    serieTempos,
    matrizDiaRede,
  }
}
