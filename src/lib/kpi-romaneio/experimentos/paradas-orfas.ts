import { haversine } from '@/lib/utils/geo'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import type { DumpExperimento, LinhaDump } from './tipos'

export type ParametrosOrfas = {
  /** parada mais curta que isso (segundos) nao conta */
  duracaoMinSeg: number
  /** parada a ate' esta distancia (m) de uma NF confirmada da mesma placa ja' tem dono */
  raioReivindicadaM: number
}

export type ResultadoRaio = {
  raioM: number
  comOrfa: number
  comOrfaExclusiva: number
  porCategoria: Record<string, { pendentes: number; comOrfa: number }>
}

export type AnaliseOrfas = {
  data: string
  totalNfs: number
  identificadas: number
  taxaIdentificada: number
  pendentes: number
  pendentesSemCoordenada: number
  orfasTotal: number
  porRaio: ResultadoRaio[]
}

export function categoriaPendente(observacao: string | null): string {
  if (observacao == null) return 'sem confirmação'
  if (observacao.startsWith('ENDEREÇO COM COORDENADA IMPRECISA')) return 'coordenada imprecisa'
  if (observacao.startsWith('PARADA PRÓXIMA (500m-2km)')) return 'parada 500m-2km'
  if (observacao.startsWith('NÃO FOI AO CLIENTE')) return 'não foi ao cliente'
  if (observacao.startsWith('PASSOU NO ENDEREÇO')) return 'passou sem parar'
  if (observacao.startsWith('CLIENTE SEM ACESSO')) return 'ilha'
  return 'outra'
}

export function paradasOrfasDaPlaca(dump: DumpExperimento, placa: string, p: ParametrosOrfas): UnitracParadaRow[] {
  const confirmadas = dump.linhas.filter(
    (l): l is LinhaDump & { lat: number; lng: number } => l.placa === placa && l.status !== 'pendente' && l.lat != null && l.lng != null,
  )
  return (dump.paradasPorPlaca[placa] ?? []).filter(s =>
    s.classificacao === 'FORA_BASE' &&
    s.lat != null && s.lng != null &&
    (s.duracao_seg ?? 0) >= p.duracaoMinSeg &&
    !confirmadas.some(c => haversine(s.lat as number, s.lng as number, c.lat, c.lng) <= p.raioReivindicadaM),
  )
}

export function orfasProximasDoPendente(
  dump: DumpExperimento, linha: LinhaDump, p: ParametrosOrfas, raioM: number,
): { parada: UnitracParadaRow; distanciaM: number }[] {
  if (linha.lat == null || linha.lng == null) return []
  const { lat, lng } = linha
  return paradasOrfasDaPlaca(dump, linha.placa, p)
    .map(parada => ({ parada, distanciaM: haversine(parada.lat as number, parada.lng as number, lat, lng) }))
    .filter(x => x.distanciaM <= raioM)
    .sort((a, b) => a.distanciaM - b.distanciaM)
}

export function analisarParadasOrfas(dump: DumpExperimento, raiosM: number[], p: ParametrosOrfas): AnaliseOrfas {
  const pendentes = dump.linhas.filter(l => l.status === 'pendente')
  const comCoord = pendentes.filter(l => l.lat != null && l.lng != null)
  let orfasTotal = 0
  for (const placa of new Set(dump.linhas.map(l => l.placa))) orfasTotal += paradasOrfasDaPlaca(dump, placa, p).length

  const porRaio = raiosM.map((raioM): ResultadoRaio => {
    // pendente mais proximo de cada parada orfa, pra medir exclusividade
    const melhorDist = new Map<string, number>()
    const donoDaOrfa = new Map<string, string>()
    for (const l of comCoord) {
      for (const { parada, distanciaM } of orfasProximasDoPendente(dump, l, p, raioM)) {
        const k = `${l.placa}|${parada.id}`
        const atual = melhorDist.get(k)
        if (atual === undefined || distanciaM < atual) {
          melhorDist.set(k, distanciaM)
          donoDaOrfa.set(k, l.nf)
        }
      }
    }
    const porCategoria: ResultadoRaio['porCategoria'] = {}
    let comOrfa = 0
    let comOrfaExclusiva = 0
    for (const l of pendentes) {
      const cat = categoriaPendente(l.observacao)
      const c = (porCategoria[cat] ??= { pendentes: 0, comOrfa: 0 })
      c.pendentes++
      const proximas = orfasProximasDoPendente(dump, l, p, raioM)
      if (proximas.length === 0) continue
      comOrfa++
      c.comOrfa++
      if (donoDaOrfa.get(`${l.placa}|${proximas[0].parada.id}`) === l.nf) comOrfaExclusiva++
    }
    return { raioM, comOrfa, comOrfaExclusiva, porCategoria }
  })

  const identificadas = dump.linhas.filter(l => l.status !== 'pendente').length
  return {
    data: dump.data,
    totalNfs: dump.linhas.length,
    identificadas,
    taxaIdentificada: dump.linhas.length === 0 ? 0 : identificadas / dump.linhas.length,
    pendentes: pendentes.length,
    pendentesSemCoordenada: pendentes.length - comCoord.length,
    orfasTotal,
    porRaio,
  }
}
