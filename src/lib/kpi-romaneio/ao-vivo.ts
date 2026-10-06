// KPI ao vivo (spec 2026-10-06-kpi-ao-vivo-design.md): funções puras que
// transformam o resultado do cálculo do KPI (a mesma planilha da geração
// normal, lida por extrairKpiCompleto) no que a tela mostra, e a camada
// "agora" (parada em andamento + NF mais perto). A classificação vem SEMPRE do
// KPI; daqui só sai apresentação.
import type { NfResumo, CargaResumo } from './resumo-dashboard'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import { RAIO_CONFIRMACAO_AMPLIADO_METROS } from './constants'

export type SituacaoNf = 'entregue' | 'sem_rastreador' | 'pendente' | 'nao_foi' | 'revisar'

export type NfAoVivo = {
  nf: string
  carga: string
  cliente: string
  endereco: string
  status: string // rótulo da planilha, sem alteração
  situacao: SituacaoNf
  chegada: string | null // HH:MM
  saida: string | null
  tempoMin: number | null
  lat: number | null
  lng: number | null
  /** Onde o caminhão parou na entrega (parada da Unitrac). Opcional: o
   *  histórico lido da planilha guardada não tem. */
  parada?: { lat: number; lng: number } | null
}

export type PlacaAoVivo = {
  placa: string
  motorista: string
  destino: string
  cargas: string[]
  saidaBase: string | null // ISO
  chegadaBase: string | null // ISO
  km: number | null
  total: number
  feitas: number
  pct: number
  nfs: NfAoVivo[]
}

/** "06:30" do dia AAAA-MM-DD (BRT) -> "2026-10-06T06:30:00-03:00". */
export function horaParaIso(data: string, hhmm: string | null): string | null {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm.trim())) return null
  const [h, m] = hhmm.trim().split(':')
  return `${data}T${h.padStart(2, '0')}:${m}:00-03:00`
}

function situacaoDe(n: NfResumo): SituacaoNf {
  if (n.categoria == null) return 'entregue'
  if (n.categoria === 'Sem rastreador') return 'sem_rastreador'
  if (n.categoria === 'Não foi ao cliente') return 'nao_foi'
  if (n.categoria === 'Aguardando fim da rota' || n.categoria === 'Sem confirmação') return 'pendente'
  return 'revisar'
}

/** Uma entrada por placa, com as NFs na ordem da planilha. "Feitas" segue a
 *  regra da taxa: entregue + sem rastreador (conta como correta, 04/10). */
export function resumirPlacas(data: string, nfs: NfResumo[], cargas: CargaResumo[], coords: Map<string, { lat: number; lng: number }>, paradas: Map<string, { lat: number; lng: number }> = new Map()): PlacaAoVivo[] {
  const porPlaca = new Map<string, NfResumo[]>()
  for (const n of nfs) porPlaca.set(n.placa, [...(porPlaca.get(n.placa) ?? []), n])
  const placas: PlacaAoVivo[] = []
  for (const [placa, lista] of porPlaca) {
    const cs = cargas.filter(c => c.placa === placa)
    const saidas = cs.map(c => c.saida).filter((s): s is string => !!s).sort()
    const chegadas = cs.map(c => c.chegada).filter((s): s is string => !!s).sort()
    const nfsAoVivo: NfAoVivo[] = lista.map(n => {
      const c = coords.get(n.nf)
      return { nf: n.nf, carga: n.carga, cliente: n.cliente, endereco: n.endereco, status: n.status, situacao: situacaoDe(n), chegada: n.chegada, saida: n.saida, tempoMin: n.tempoMin, lat: c?.lat ?? null, lng: c?.lng ?? null, parada: paradas.get(n.nf) ?? null }
    })
    const feitas = nfsAoVivo.filter(n => n.situacao === 'entregue' || n.situacao === 'sem_rastreador').length
    const kms = cs.map(c => c.km).filter((k): k is number => k != null)
    placas.push({
      placa,
      motorista: cs[0]?.motorista ?? '',
      destino: cs[0]?.destino ?? '',
      cargas: cs.map(c => c.carga),
      saidaBase: horaParaIso(data, saidas[0] ?? null),
      chegadaBase: horaParaIso(data, chegadas[chegadas.length - 1] ?? null),
      km: kms.length ? Math.max(...kms) : null,
      total: nfsAoVivo.length,
      feitas,
      pct: nfsAoVivo.length ? Math.round((100 * feitas) / nfsAoVivo.length) : 0,
      nfs: nfsAoVivo,
    })
  }
  return placas.sort((a, b) => a.pct - b.pct || a.placa.localeCompare(b.placa))
}

/** Parada fora da base que ainda está acontecendo: a última do dia, com fim
 *  há menos de 5 min (o feed da Unitrac fecha a parada atual no último evento). */
export function paradaEmAndamento(paradas: UnitracParadaRow[], agoraMs: number): { inicio: string; lat: number | null; lng: number | null } | null {
  const ultima = [...paradas].sort((a, b) => a.chegada.localeCompare(b.chegada)).pop()
  if (!ultima || ultima.classificacao === 'BASE') return null
  const fim = Date.parse(ultima.fim_real ?? ultima.saida ?? ultima.chegada)
  if (!Number.isFinite(fim) || agoraMs - fim > 5 * 60_000) return null
  const p = ultima as UnitracParadaRow & { lat?: number | null; lng?: number | null }
  return { inicio: ultima.chegada, lat: p.lat ?? null, lng: p.lng ?? null }
}

/** Ponto da parada da Unitrac em que a chegada da NF (ISO) cai -- é a parada
 *  que o KPI contou como entrega. Fora de qualquer parada: a que começa mais
 *  perto da chegada, até 5 min. */
export function paradaDaChegada(paradas: UnitracParadaRow[], chegadaIso: string | null): { lat: number; lng: number } | null {
  if (!chegadaIso) return null
  const t = Date.parse(chegadaIso)
  if (!Number.isFinite(t)) return null
  const comCoord = paradas
    .map(p => ({ p, lat: (p as UnitracParadaRow & { lat?: number | null }).lat, lng: (p as UnitracParadaRow & { lng?: number | null }).lng }))
    .filter((x): x is { p: UnitracParadaRow; lat: number; lng: number } => x.lat != null && x.lng != null)
  // Na virada entre duas paradas (uma termina quando a outra começa), vale a
  // que começou mais tarde -- é a do cliente, não a anterior.
  const dentro = comCoord
    .filter(({ p }) => { const ini = Date.parse(p.chegada), fim = Date.parse(p.fim_real ?? p.saida ?? p.chegada); return t >= ini - 60_000 && t <= fim })
    .sort((a, b) => Date.parse(b.p.chegada) - Date.parse(a.p.chegada))[0]
  if (dentro) return { lat: dentro.lat, lng: dentro.lng }
  let melhor: { lat: number; lng: number } | null = null, dt = Infinity
  for (const x of comCoord) { const d = Math.abs(Date.parse(x.p.chegada) - t); if (d < dt) { dt = d; melhor = { lat: x.lat, lng: x.lng } } }
  return melhor && dt <= 5 * 60_000 ? melhor : null
}

function distanciaM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000
  const rad = (x: number) => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** NF mais perto do caminhão parado, até 800 m (a régua ampliada do KPI).
 *  Prefere as que ainda não foram entregues. Só pra mostrar "no cliente
 *  agora": quem decide entregue é o cálculo do KPI. */
export function nfProxima<T extends { nf: string; situacao: SituacaoNf; lat: number | null; lng: number | null }>(nfs: T[], ponto: { lat: number; lng: number }): T | null {
  const perto = nfs
    .filter((n): n is T & { lat: number; lng: number } => n.lat != null && n.lng != null)
    .map(n => ({ n, d: distanciaM(ponto, n) }))
    .filter(x => x.d <= RAIO_CONFIRMACAO_AMPLIADO_METROS)
    .sort((a, b) => a.d - b.d)
  const naoEntregue = perto.find(x => x.n.situacao !== 'entregue' && x.n.situacao !== 'sem_rastreador')
  return (naoEntregue ?? perto[0])?.n ?? null
}
