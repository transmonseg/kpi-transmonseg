import { hojeBR } from '@/lib/data-br'
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
  taxa: number | null
  km: number
  operacaoMedia: number | null
  porEntregaMedia: number | null
  porDia: { data: string; nfPlanejado: number; nfConfirmadas: number; km: number | null; saida: string | null; chegada: string | null; operacao: number | null }[]
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
      if (c.tempoMedioMin && c.tempoMedioMin > 0) {
        porEnt.push(c.tempoMedioMin)
        porEntregaPorPlaca.set(c.placa, [...(porEntregaPorPlaca.get(c.placa) ?? []), c.tempoMedioMin])
      }
      const p = placas.get(c.placa) ?? {
        placa: c.placa, motorista: c.motorista, destino: c.destino, dias: 0,
        nfPlanejado: 0, nfConfirmadas: 0, taxa: null, km: 0,
        operacaoMedia: null, porEntregaMedia: null, porDia: [],
      }
      p.dias += 1
      p.nfPlanejado += c.nfPlanejado ?? 0
      p.nfConfirmadas += c.nfConfirmadas ?? 0
      p.km += c.km ?? 0
      if (c.motorista) p.motorista = c.motorista
      if (c.destino) p.destino = c.destino
      p.porDia.push({ data: d.data, nfPlanejado: c.nfPlanejado ?? 0, nfConfirmadas: c.nfConfirmadas ?? 0, km: c.km, saida: c.saida, chegada: c.chegada, operacao: c.tempoOperacaoMin })
      placas.set(c.placa, p)
    }
  }
  // médias por placa
  for (const p of placas.values()) {
    p.operacaoMedia = media(p.porDia.map(x => x.operacao).filter((v): v is number => v != null && v > 0))
    p.porEntregaMedia = media((porEntregaPorPlaca.get(p.placa) ?? []))
  }
  for (const p of placas.values()) p.taxa = p.nfPlanejado > 0 ? (p.nfConfirmadas / p.nfPlanejado) * 100 : null

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
export function tom(taxa: number | null | undefined): 'ok' | 'warn' | 'bad' {
  if (taxa == null) return 'warn'
  return taxa >= 95 ? 'ok' : taxa >= 85 ? 'warn' : 'bad'
}
export const COR_TOM = { ok: 'var(--color-success)', warn: 'var(--color-warning)', bad: 'var(--color-danger)' } as const
