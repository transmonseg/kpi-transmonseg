import { hojeBR } from '@/lib/data-br'
import { META_KPI_PADRAO } from '@/lib/kpi/metas'
import type { DiaKpi } from '@/lib/kpi-romaneio/dashboard-kpis'

export type Periodo = 'dia' | 'semana' | 'mes' | 'ano' | 'custom'

export const hoje = () => hojeBR()

const iso = (d: Date) => d.toISOString().slice(0, 10)
const meioDia = (s: string) => new Date(`${s}T12:00:00Z`)

export function somarDias(s: string, n: number): string {
  const d = meioDia(s)
  d.setUTCDate(d.getUTCDate() + n)
  return iso(d)
}

/** [de, ate] do período escolhido (semana = segunda a domingo). */
export function intervalo(periodo: Periodo, data: string, de: string, ate: string): [string, string] {
  if (periodo === 'dia') return [data, data]
  if (periodo === 'custom') return de <= ate ? [de, ate] : [ate, de]
  if (periodo === 'ano') return [`${data.slice(0, 4)}-01-01`, `${data.slice(0, 4)}-12-31`]
  if (periodo === 'mes') {
    const [y, m] = data.split('-').map(Number)
    const fim = new Date(Date.UTC(y, m, 0))
    return [`${data.slice(0, 7)}-01`, iso(fim)]
  }
  const d = meioDia(data)
  const dow = (d.getUTCDay() + 6) % 7 // 0 = segunda
  const ini = somarDias(data, -dow)
  return [ini, somarDias(ini, 6)]
}

/** Período anterior equivalente (pra comparar). */
export function intervaloAnterior([de, ate]: [string, string]): [string, string] {
  const dias = Math.round((meioDia(ate).getTime() - meioDia(de).getTime()) / 86_400_000) + 1
  return [somarDias(de, -dias), somarDias(de, -1)]
}

export const ehParcial = (d: DiaKpi) => (d.resumo.aguardando ?? 0) > 0

const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

export type PlacaAgg = {
  placa: string
  motorista: string
  destino: string
  dias: number
  nfPlanejado: number
  nfConfirmadas: number
  /** NFs fora da taxa (sem rastreador / placa trocada) -- não contam na taxa da placa. */
  nfForaDaConta: number
  nfSemRastreador: number
  taxa: number | null
  km: number
  operacaoMedia: number | null
  porEntregaMedia: number | null
  porDia: { data: string; nfPlanejado: number; nfConfirmadas: number; nfForaDaConta: number; km: number | null; saida: string | null; chegada: string | null; operacao: number | null }[]
}

export type Agregado = {
  dias: DiaKpi[]
  diasCompletos: number
  diasParciais: number
  taxa: number | null
  entregues: number
  nfsNaConta: number
  pendentes: number
  semRastreador: number
  cargas: number
  km: number
  operacaoMedia: number | null
  porEntregaMedia: number | null
  motivos: Record<string, number>
  placas: PlacaAgg[]
  serie: { data: string; taxa: number | null; km: number; parcial: boolean }[]
}

/** Junta os dias inseridos. Dia parcial (rota em andamento) entra na série,
 *  mas fica fora dos totais e médias. */
export function agregar(dias: DiaKpi[]): Agregado {
  const completos = dias.filter(d => !ehParcial(d))
  let entregues = 0, nfsNaConta = 0, pendentes = 0, semRastreador = 0, cargas = 0, km = 0
  const ops: number[] = [], porEnt: number[] = []
  const motivos: Record<string, number> = {}
  const placas = new Map<string, PlacaAgg>()
  const porEntregaPorPlaca = new Map<string, number[]>()

  for (const d of completos) {
    const r = d.resumo
    entregues += r.entregues ?? 0
    nfsNaConta += r.nfsNaConta ?? 0
    pendentes += r.pendentes
    semRastreador += r.semRastreador
    cargas += r.cargas.length
    for (const [m, n] of Object.entries(r.motivos)) motivos[m] = (motivos[m] ?? 0) + n
    for (const c of r.cargas) {
      km += c.km ?? 0
      if (c.tempoOperacaoMin && c.tempoOperacaoMin > 0) ops.push(c.tempoOperacaoMin)
      // Carga sem nenhuma NF confirmada (sem rastreador / fora da conta) nao
      // tem tempo por entrega real -- o valor da planilha e' lixo (ex.: 9h24).
      if (c.tempoMedioMin && c.tempoMedioMin > 0 && (c.nfConfirmadas ?? 0) > 0) {
        porEnt.push(c.tempoMedioMin)
        porEntregaPorPlaca.set(c.placa, [...(porEntregaPorPlaca.get(c.placa) ?? []), c.tempoMedioMin])
      }
      const p = placas.get(c.placa) ?? {
        placa: c.placa, motorista: c.motorista, destino: c.destino, dias: 0,
        nfPlanejado: 0, nfConfirmadas: 0, nfForaDaConta: 0, nfSemRastreador: 0, taxa: null, km: 0,
        operacaoMedia: null, porEntregaMedia: null, porDia: [],
      }
      p.dias += 1
      p.nfPlanejado += c.nfPlanejado ?? 0
      p.nfConfirmadas += c.nfConfirmadas ?? 0
      p.nfForaDaConta += c.nfForaDaConta ?? 0
      p.nfSemRastreador += c.nfSemRastreador ?? 0
      p.km += c.km ?? 0
      if (c.motorista) p.motorista = c.motorista
      if (c.destino) p.destino = c.destino
      p.porDia.push({ data: d.data, nfPlanejado: c.nfPlanejado ?? 0, nfConfirmadas: c.nfConfirmadas ?? 0, nfForaDaConta: c.nfForaDaConta ?? 0, km: c.km, saida: c.saida, chegada: c.chegada, operacao: c.tempoOperacaoMin })
      placas.set(c.placa, p)
    }
  }
  // médias por placa
  for (const p of placas.values()) {
    p.operacaoMedia = media(p.porDia.map(x => x.operacao).filter((v): v is number => v != null && v > 0))
    p.porEntregaMedia = media((porEntregaPorPlaca.get(p.placa) ?? []))
  }
  for (const p of placas.values()) {
    const naConta = p.nfPlanejado - p.nfForaDaConta
    p.taxa = naConta > 0 ? Math.min(100, (p.nfConfirmadas / naConta) * 100) : null
  }

  return {
    dias,
    diasCompletos: completos.length,
    diasParciais: dias.length - completos.length,
    taxa: nfsNaConta > 0 ? (entregues / nfsNaConta) * 100 : null,
    entregues, nfsNaConta, pendentes, semRastreador, cargas, km,
    operacaoMedia: media(ops),
    porEntregaMedia: media(porEnt),
    motivos,
    placas: [...placas.values()],
    serie: dias.map(d => ({ data: d.data, taxa: d.resumo.taxa, km: d.resumo.cargas.reduce((a, c) => a + (c.km ?? 0), 0), parcial: ehParcial(d) })),
  }
}

// F3-10 (ACH-08): Dashboard por rota e por motorista. A placa troca de rota
// (em outubro, 100 de 187 rotas rodaram com mais de uma placa); a Érica
// acompanha pelo nome da rota.

export type AgruparPor = 'rota' | 'motorista'

/** Chave do agrupamento: só tira acento, caixa e espaço sobrando (inclusive
 *  depois do ponto: "S.A. DE PADUA" = "S.A.DE PADUA"). Erro de digitação
 *  ("ANGRAS DOS REIS") não é juntado -- não adivinha. */
export function chaveGrupo(s: string): string {
  return (s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/\s+/g, ' ').replace(/\.\s+/g, '.').trim()
}

export type GrupoDia = { data: string; placas: string[]; nfConfirmadas: number; naConta: number; taxa: number | null }
export type GrupoSemana = { semana: string; nfConfirmadas: number; naConta: number; taxa: number | null }

export type GrupoAgg = {
  chave: string
  /** Grafia mais usada no período. */
  nome: string
  /** Dias (completos) em que o grupo rodou. */
  dias: number
  cargas: number
  nfPlanejado: number
  nfConfirmadas: number
  nfForaDaConta: number
  nfSemRastreador: number
  taxa: number | null
  /** Placas distintas, na ordem em que apareceram. */
  placas: string[]
  /** Por rota: motoristas; por motorista: rotas (grafia mais usada). */
  outros: string[]
  porDia: GrupoDia[]
  /** Tendência semanal (segunda a domingo). */
  semanas: GrupoSemana[]
}

const taxaDe = (conf: number, naConta: number) => (naConta > 0 ? Math.min(100, (conf / naConta) * 100) : null)
const SEM_MOTORISTA = 'Sem motorista'
const SEM_ROTA = 'Sem rota'

/** Agrega os dias completos (parcial fica fora, como em agregar) por rota
 *  (destino da carga) ou por motorista. Taxa = confirmadas / (planejadas -
 *  fora da conta), a mesma da placa. */
export function agregarPor(dias: DiaKpi[], por: AgruparPor): GrupoAgg[] {
  type Acc = GrupoAgg & { grafias: Map<string, number>; outrosAcc: Map<string, Map<string, number>>; diaMap: Map<string, GrupoDia> }
  const grupos = new Map<string, Acc>()
  const conta = (m: Map<string, number>, s: string) => m.set(s, (m.get(s) ?? 0) + 1)
  const maisUsada = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]

  for (const d of dias) {
    if (ehParcial(d)) continue
    for (const c of d.resumo.cargas) {
      const original = ((por === 'rota' ? c.destino : c.motorista) ?? '').replace(/\s+/g, ' ').trim()
      const vazio = por === 'rota' ? SEM_ROTA : SEM_MOTORISTA
      const nome = original || vazio
      const chave = original ? chaveGrupo(original) : `\u0000${vazio}`
      const g: Acc = grupos.get(chave) ?? {
        chave, nome, dias: 0, cargas: 0, nfPlanejado: 0, nfConfirmadas: 0, nfForaDaConta: 0, nfSemRastreador: 0,
        taxa: null, placas: [], outros: [], porDia: [], semanas: [],
        grafias: new Map(), outrosAcc: new Map(), diaMap: new Map(),
      }
      conta(g.grafias, nome)
      const outro = ((por === 'rota' ? c.motorista : c.destino) ?? '').replace(/\s+/g, ' ').trim()
      if (outro) {
        const k = chaveGrupo(outro)
        conta(g.outrosAcc.get(k) ?? g.outrosAcc.set(k, new Map()).get(k)!, outro)
      }
      const plan = c.nfPlanejado ?? 0, conf = c.nfConfirmadas ?? 0, fora = c.nfForaDaConta ?? 0
      g.cargas += 1
      g.nfPlanejado += plan
      g.nfConfirmadas += conf
      g.nfForaDaConta += fora
      g.nfSemRastreador += c.nfSemRastreador ?? 0
      if (c.placa && !g.placas.includes(c.placa)) g.placas.push(c.placa)
      const gd = g.diaMap.get(d.data) ?? { data: d.data, placas: [], nfConfirmadas: 0, naConta: 0, taxa: null }
      gd.nfConfirmadas += conf
      gd.naConta += plan - fora
      if (c.placa && !gd.placas.includes(c.placa)) gd.placas.push(c.placa)
      g.diaMap.set(d.data, gd)
      grupos.set(chave, g)
    }
  }

  return [...grupos.values()].map(({ grafias, outrosAcc, diaMap, ...g }) => {
    const porDia = [...diaMap.values()].sort((a, b) => a.data.localeCompare(b.data))
    for (const x of porDia) x.taxa = taxaDe(x.nfConfirmadas, x.naConta)
    const sem = new Map<string, GrupoSemana>()
    for (const x of porDia) {
      const semana = intervalo('semana', x.data, '', '')[0]
      const s = sem.get(semana) ?? { semana, nfConfirmadas: 0, naConta: 0, taxa: null }
      s.nfConfirmadas += x.nfConfirmadas
      s.naConta += x.naConta
      sem.set(semana, s)
    }
    const semanas = [...sem.values()].sort((a, b) => a.semana.localeCompare(b.semana))
    for (const s of semanas) s.taxa = taxaDe(s.nfConfirmadas, s.naConta)
    return {
      ...g,
      nome: maisUsada(grafias),
      dias: porDia.length,
      taxa: taxaDe(g.nfConfirmadas, g.nfPlanejado - g.nfForaDaConta),
      outros: [...outrosAcc.values()].map(maisUsada),
      porDia,
      semanas,
    }
  })
}

export type Recorrente = { grupo: GrupoAgg; abaixo: number; ultimos: GrupoDia[] }

/** "Piores rotas recorrentes": abaixo da meta em pelo menos `minimo` dos
 *  últimos `janela` dias em que o grupo rodou com NF na conta (dentro do
 *  período carregado). Ordem: mais dias abaixo, depois menor taxa. */
export function pioresRecorrentes(grupos: GrupoAgg[], meta: number, janela = 5, minimo = 3): Recorrente[] {
  const out: Recorrente[] = []
  for (const grupo of grupos) {
    const ultimos = grupo.porDia.filter(d => d.taxa != null).slice(-janela)
    const abaixo = ultimos.filter(d => (d.taxa as number) < meta).length
    if (abaixo >= minimo) out.push({ grupo, abaixo, ultimos })
  }
  return out.sort((a, b) => b.abaixo - a.abaixo || (a.grupo.taxa ?? 0) - (b.grupo.taxa ?? 0))
}

export const fmtPct = (n: number | null | undefined) =>
  n == null ? '—' : `${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
export const fmtInt = (n: number | null | undefined) => (n == null ? '—' : Math.round(n).toLocaleString('pt-BR'))
export const fmtKm = (n: number | null | undefined) => (n == null ? '—' : `${Math.round(n).toLocaleString('pt-BR')} km`)
export function fmtDur(n: number | null | undefined) {
  if (n == null) return '—'
  const h = Math.floor(n / 60)
  const m = Math.round(n % 60)
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`
}
export function dataCurta(s: string) {
  const [, m, d] = s.split('-')
  return `${d}/${m}`
}
export function dataLonga(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  const t = new Date(y, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}
/** F3-02 (D-01): "ok" a partir da meta do cliente (metaDoCliente); sem ela,
 *  o 95 antigo (META_KPI_PADRAO). */
export function tom(taxa: number | null | undefined, meta: number = META_KPI_PADRAO): 'ok' | 'warn' | 'bad' {
  if (taxa == null) return 'warn'
  return taxa >= meta ? 'ok' : taxa >= 85 ? 'warn' : 'bad'
}
export const COR_TOM = { ok: 'var(--color-success)', warn: 'var(--color-warning)', bad: 'var(--color-danger)' } as const
