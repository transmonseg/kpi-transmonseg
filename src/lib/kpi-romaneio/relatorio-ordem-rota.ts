// 12/11: relatório da Ordem da rota (tela dedicada + planilha). Recebe os dias
// já com aplicarOrdemRota e monta: resumo do período, por dia, por motorista,
// por placa e cada viagem com a sequência completa. 14/11 (dono: "não dá pra
// filtrar como eu quero, só um motorista ou só tal horário"): filtros por
// motorista, placa, horário e só fora da ordem -- os mesmos na tela e no
// Excel -- e mais dados por entrega (endereço, carga, saída, tempo no
// cliente) e por viagem (saída/volta da base, km, entregas não feitas). Pura.
import { viagemInvertida } from './ordem-rota'

type NfDia = {
  nf: string; carga?: string; cliente: string; endereco?: string; situacao: string
  chegada: string | null; saida?: string | null; tempoMin?: number | null
  lat?: number | null; lng?: number | null; pontoImpreciso?: boolean
  /** parada do GPS que o KPI contou como a entrega (ponto real do caminhão) */
  parada?: { lat: number; lng: number } | null
  ordemRota?: { planejada: number; real: number; naOrdem: boolean; romaneio: string; previsao: string | null }
}
type PlacaDia = { placa: string; motorista: string; destino?: string; saidaBase?: string | null; chegadaBase?: string | null; km?: number | null; nfs: NfDia[] }
export type PlanoNf = { nf: string; romaneio: string; ordem: number }
export type DiaComOrdem = { data: string; placas: PlacaDia[]; /** ordem planejada guardada do dia (para as não feitas). */ plano?: PlanoNf[] }

export type EntregaSequencia = {
  real: number; planejada: number; naOrdem: boolean
  nf: string; carga: string; cliente: string; endereco: string
  chegada: string | null; saida: string | null; tempoMin: number | null; previsao: string | null
}
export type NaoFeita = { planejada: number; nf: string; cliente: string; endereco: string; situacao: string }
export type Viagem = {
  data: string; placa: string; motorista: string; destino: string; romaneio: string
  saidaBase: string | null; chegadaBase: string | null; km: number | null
  primeira: string | null; ultima: string | null
  entregas: number; naOrdem: number; pct: number; invertida: boolean
  /** planejadas no romaneio que não foram entregues (ficaram de fora da sequência). */
  naoFeitas: number
  naoFeitasLista: NaoFeita[]
  sequencia: EntregaSequencia[]
  /** 16/11: km entre clientes em linha reta, na ordem feita e na do plano
   *  (null sem ponto confiável de >= 60% dos clientes). Extra > 0 = andou mais. */
  kmFeito: number | null; kmPlano: number | null; kmExtra: number | null
}
export type Agregado = {
  chave: string; nome: string; sub: string; entregas: number; naOrdem: number; pct: number; viagens: number; invertidas: number; naoFeitas: number
  /** km a mais (linha reta) somado das viagens com ponto */
  kmExtra: number
  /** % na ordem de cada dia (recorrência) */
  porDia: { data: string; pct: number }[]
  /** dias abaixo da meta da ordem (70%) */
  diasAbaixo: number
}
/** 16/11: clientes que mais ficam fora da ordem (vários motoristas pulando o
 *  mesmo cliente = pista de roteirização ou horário de recebimento). */
export type ClienteOrdem = { cliente: string; endereco: string; vezes: number; fora: number; pctFora: number; motoristas: number }
export const META_ORDEM_PCT = 70
export type RelatorioOrdemRota = {
  de: string; ate: string
  total: { entregas: number; naOrdem: number; pct: number; viagens: number; invertidas: number; kmExtra: number; viagensComKm: number
    /** viagens que andaram >= 1 km a mais / a menos que a ordem do plano */
    maisLongas: number; maisCurtas: number }
  dias: { data: string; entregas: number; naOrdem: number; pct: number; viagens: number }[]
  motoristas: Agregado[]
  placas: Agregado[]
  clientes: ClienteOrdem[]
  viagens: Viagem[]
}
export type FiltrosOrdemRota = {
  motoristas?: string[]; placas?: string[]
  /** HH:MM, pela hora de chegada em cada cliente. */
  horaDe?: string | null; horaAte?: string | null
  soForaDaOrdem?: boolean; soInvertidas?: boolean
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0)
const km1 = (x: number) => Math.round(x * 10) / 10
function distKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371, rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
const caminho = (pts: { lat: number; lng: number }[]) => pts.slice(1).reduce((s, p, i) => s + distKm(pts[i], p), 0)
const mediana = (xs: number[]) => { const o = [...xs].sort((a, b) => a - b); return o[Math.floor(o.length / 2)] }
/** Km (linha reta) entre os clientes na ordem feita x na ordem do plano. Usa
 *  a parada real do caminhão (GPS); sem ela, o ponto do cliente (se confiável).
 *  Ponto a mais de 60 km do meio da viagem é cadastro errado e fica de fora
 *  (16/11: RTL4B31 dava 1.826 km "no plano" por um endereço mal geocodificado). */
export function kmDaViagem(feitas: { planejada: number; lat?: number | null; lng?: number | null; pontoImpreciso?: boolean; parada?: { lat: number; lng: number } | null }[]): { kmFeito: number; kmPlano: number; kmExtra: number } | null {
  const pts = feitas.map(x => {
    const c = x.parada ?? (x.lat != null && x.lng != null && !x.pontoImpreciso ? { lat: x.lat, lng: x.lng } : null)
    return c ? { planejada: x.planejada, lat: c.lat, lng: c.lng } : null
  }).filter((x): x is { planejada: number; lat: number; lng: number } => x != null)
  if (pts.length < 3) return null
  const meio = { lat: mediana(pts.map(p => p.lat)), lng: mediana(pts.map(p => p.lng)) }
  const com = pts.filter(p => distKm(meio, p) <= 60)
  if (com.length < 3 || com.length < 0.6 * feitas.length) return null
  const feito = caminho(com), plano = caminho([...com].sort((a, b) => a.planejada - b.planejada))
  return { kmFeito: km1(feito), kmPlano: km1(plano), kmExtra: km1(feito - plano) }
}
const hhmm = (iso: string | null | undefined) => {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
}

export function montarRelatorioOrdemRota(dias: DiaComOrdem[], de: string, ate: string): RelatorioOrdemRota {
  const viagens: Viagem[] = []
  for (const d of dias) {
    const planoPorRomaneio = new Map<string, PlanoNf[]>()
    for (const p of d.plano ?? []) planoPorRomaneio.set(p.romaneio, [...(planoPorRomaneio.get(p.romaneio) ?? []), p])
    for (const p of d.placas) {
      const porRomaneio = new Map<string, NfDia[]>()
      for (const n of p.nfs) {
        if (!n.ordemRota) continue
        porRomaneio.set(n.ordemRota.romaneio, [...(porRomaneio.get(n.ordemRota.romaneio) ?? []), n])
      }
      const nfDaPlaca = new Map(p.nfs.map(n => [n.nf, n]))
      for (const [romaneio, l] of porRomaneio) {
        // A previsão do relatório de ordem é só informativa: ela é recalculada
        // quando o motorista inicia a rota no app (RIQ4G11 12/11: 1ª prevista
        // 14:44, entregando desde de manhã) -- não serve de régua de atraso.
        const seq: EntregaSequencia[] = l.sort((a, b) => a.ordemRota!.real - b.ordemRota!.real).map(n => ({
          real: n.ordemRota!.real, planejada: n.ordemRota!.planejada, naOrdem: n.ordemRota!.naOrdem,
          nf: n.nf, carga: n.carga ?? '', cliente: n.cliente, endereco: n.endereco ?? '',
          chegada: n.chegada, saida: n.saida ?? null, tempoMin: n.tempoMin ?? null, previsao: n.ordemRota!.previsao,
        }))
        const feitas = new Set(seq.map(s => s.nf))
        const naoFeitasLista: NaoFeita[] = (planoPorRomaneio.get(romaneio) ?? [])
          .filter(x => !feitas.has(x.nf))
          .sort((a, b) => a.ordem - b.ordem)
          .map(x => {
            const n = nfDaPlaca.get(x.nf)
            return { planejada: x.ordem, nf: x.nf, cliente: n?.cliente ?? '', endereco: n?.endereco ?? '', situacao: n?.situacao ?? 'fora do KPI' }
          })
        const ok = seq.filter(s => s.naOrdem).length
        const km = kmDaViagem(l.map(n => ({ planejada: n.ordemRota!.planejada, lat: n.lat, lng: n.lng, pontoImpreciso: n.pontoImpreciso, parada: n.parada })))
        viagens.push({
          data: d.data, placa: p.placa, motorista: p.motorista || 'Motorista não informado', destino: p.destino ?? '', romaneio,
          saidaBase: hhmm(p.saidaBase), chegadaBase: hhmm(p.chegadaBase), km: p.km ?? null,
          primeira: seq[0]?.chegada ?? null, ultima: seq[seq.length - 1]?.chegada ?? null,
          entregas: seq.length, naOrdem: ok, pct: pct(ok, seq.length), invertida: viagemInvertida(seq.map(s => s.planejada)),
          naoFeitas: naoFeitasLista.length, naoFeitasLista, sequencia: seq,
          kmFeito: km?.kmFeito ?? null, kmPlano: km?.kmPlano ?? null, kmExtra: km?.kmExtra ?? null,
        })
      }
    }
  }
  return agregarViagens(viagens, de, ate)
}

/** Totais, por dia, por motorista e por placa a partir de uma lista de viagens. */
export function agregarViagens(viagensEntrada: Viagem[], de: string, ate: string): RelatorioOrdemRota {
  const viagens = [...viagensEntrada].sort((a, b) => a.data.localeCompare(b.data) || a.pct - b.pct || a.placa.localeCompare(b.placa))
  const soma = (vs: Viagem[]) => {
    const e = vs.reduce((s, v) => s + v.entregas, 0), ok = vs.reduce((s, v) => s + v.naOrdem, 0)
    return { entregas: e, naOrdem: ok, pct: pct(ok, e) }
  }
  const agregar = (chave: (v: Viagem) => string, sub: (vs: Viagem[]) => string): Agregado[] => {
    const g = new Map<string, Viagem[]>()
    for (const v of viagens) { const k = chave(v); g.set(k, [...(g.get(k) ?? []), v]) }
    return [...g].map(([k, vs]) => {
      const porDia = [...new Set(vs.map(v => v.data))].sort().map(data => ({ data, pct: soma(vs.filter(v => v.data === data)).pct }))
      return {
        chave: k, nome: k, sub: sub(vs), ...soma(vs), viagens: vs.length,
        invertidas: vs.filter(v => v.invertida).length, naoFeitas: vs.reduce((s, v) => s + v.naoFeitas, 0),
        kmExtra: km1(vs.reduce((s, v) => s + (v.kmExtra ?? 0), 0)),
        porDia, diasAbaixo: porDia.filter(d => d.pct < META_ORDEM_PCT).length,
      }
    }).sort((a, b) => a.pct - b.pct || b.entregas - a.entregas)
  }
  const porCliente = new Map<string, { cliente: string; endereco: string; vezes: number; fora: number; mot: Set<string> }>()
  for (const v of viagens) for (const e of v.sequencia) {
    const k = `${e.cliente}|${e.endereco}`
    const c = porCliente.get(k) ?? { cliente: e.cliente, endereco: e.endereco, vezes: 0, fora: 0, mot: new Set<string>() }
    c.vezes++
    if (!e.naOrdem) { c.fora++; c.mot.add(v.motorista) }
    porCliente.set(k, c)
  }
  const clientes: ClienteOrdem[] = [...porCliente.values()].filter(c => c.fora > 0)
    .map(c => ({ cliente: c.cliente, endereco: c.endereco, vezes: c.vezes, fora: c.fora, pctFora: pct(c.fora, c.vezes), motoristas: c.mot.size }))
    .sort((a, b) => b.fora - a.fora || b.pctFora - a.pctFora)
  const unicos = (xs: string[]) => [...new Set(xs)].join(', ')
  const diasR = [...new Set(viagens.map(v => v.data))].sort().map(data => {
    const vs = viagens.filter(v => v.data === data)
    return { data, ...soma(vs), viagens: vs.length }
  })
  return {
    de, ate,
    total: {
      ...soma(viagens), viagens: viagens.length, invertidas: viagens.filter(v => v.invertida).length,
      kmExtra: km1(viagens.reduce((s, v) => s + (v.kmExtra ?? 0), 0)), viagensComKm: viagens.filter(v => v.kmExtra != null).length,
      maisLongas: viagens.filter(v => (v.kmExtra ?? 0) >= 1).length, maisCurtas: viagens.filter(v => (v.kmExtra ?? 0) <= -1).length,
    },
    dias: diasR,
    motoristas: agregar(v => v.motorista, vs => unicos(vs.map(v => v.placa))),
    placas: agregar(v => v.placa, vs => unicos(vs.map(v => v.motorista))),
    clientes,
    viagens,
  }
}

export const filtrosVazios = (f: FiltrosOrdemRota) =>
  !f.motoristas?.length && !f.placas?.length && !f.horaDe && !f.horaAte && !f.soForaDaOrdem && !f.soInvertidas

/** Aplica os filtros: viagens do motorista/placa; dentro delas, só as entregas
 *  no horário (e só as fora da ordem, se pedido). "Na ordem" de cada entrega
 *  continua o da viagem inteira -- filtrar não muda o veredito. */
export function filtrarRelatorio(r: RelatorioOrdemRota, f: FiltrosOrdemRota): RelatorioOrdemRota {
  if (filtrosVazios(f)) return r
  const mot = new Set(f.motoristas ?? []), pl = new Set(f.placas ?? [])
  const viagens: Viagem[] = []
  for (const v of r.viagens) {
    if (mot.size && !mot.has(v.motorista)) continue
    if (pl.size && !pl.has(v.placa)) continue
    if (f.soInvertidas && !v.invertida) continue
    const seq = v.sequencia.filter(s =>
      (!f.horaDe || (s.chegada != null && s.chegada >= f.horaDe)) &&
      (!f.horaAte || (s.chegada != null && s.chegada <= f.horaAte)) &&
      (!f.soForaDaOrdem || !s.naOrdem))
    if (!seq.length) continue
    const ok = seq.filter(s => s.naOrdem).length
    viagens.push({ ...v, sequencia: seq, entregas: seq.length, naOrdem: ok, pct: pct(ok, seq.length) })
  }
  return agregarViagens(viagens, r.de, r.ate)
}

/** Lê os filtros da URL (?motorista=A&motorista=B&placa=X&de_hora=08:00&ate_hora=12:00&fora=1&invertidas=1). */
export function filtrosDaUrl(sp: URLSearchParams): FiltrosOrdemRota {
  const hora = (v: string | null) => (v && /^\d{2}:\d{2}$/.test(v) ? v : null)
  return {
    motoristas: sp.getAll('motorista').filter(Boolean), placas: sp.getAll('placa').filter(Boolean),
    horaDe: hora(sp.get('de_hora')), horaAte: hora(sp.get('ate_hora')),
    soForaDaOrdem: sp.get('fora') === '1', soInvertidas: sp.get('invertidas') === '1',
  }
}

export function filtrosParaUrl(f: FiltrosOrdemRota): string {
  const q = new URLSearchParams()
  for (const m of f.motoristas ?? []) q.append('motorista', m)
  for (const p of f.placas ?? []) q.append('placa', p)
  if (f.horaDe) q.set('de_hora', f.horaDe)
  if (f.horaAte) q.set('ate_hora', f.horaAte)
  if (f.soForaDaOrdem) q.set('fora', '1')
  if (f.soInvertidas) q.set('invertidas', '1')
  return q.toString()
}

/** "Motorista: X · Horário: 08:00–12:00 · Só fora da ordem" (para o Excel). */
export function descreverFiltros(f: FiltrosOrdemRota): string {
  const partes: string[] = []
  if (f.motoristas?.length) partes.push(`Motorista: ${f.motoristas.join(', ')}`)
  if (f.placas?.length) partes.push(`Placa: ${f.placas.join(', ')}`)
  if (f.horaDe || f.horaAte) partes.push(`Horário de chegada: ${f.horaDe ?? '00:00'}–${f.horaAte ?? '23:59'}`)
  if (f.soForaDaOrdem) partes.push('Só entregas fora da ordem')
  if (f.soInvertidas) partes.push('Só rotas de trás pra frente')
  return partes.length ? partes.join(' · ') : 'Sem filtro (todas as viagens)'
}

/** Viagem enxuta pro Dashboard: a fila de entregas só com a posição no plano. */
export type ViagemDash = {
  data: string; placa: string; motorista: string; destino: string
  entregas: number; naOrdem: number; pct: number; invertida: boolean; kmExtra: number | null
  /** [posição no plano, na ordem?] na ordem em que foi feita */
  fila: [number, boolean][]
  /** posições no plano que não foram entregues */
  naoFeitas: number[]
}
export type OrdemDashboard = Omit<RelatorioOrdemRota, 'viagens' | 'clientes'> & { viagens: ViagemDash[]; clientes: Omit<ClienteOrdem, 'endereco'>[] }

/** 16/11: o relatório da Ordem da rota sem endereço/cliente/horários, pro
 *  Dashboard (um mês inteiro fica leve). */
export function resumoOrdemDashboard(r: RelatorioOrdemRota): OrdemDashboard {
  const { de, ate, total, dias, motoristas, placas } = r
  return {
    de, ate, total, dias, motoristas, placas,
    clientes: r.clientes.slice(0, 15).map(({ endereco: _e, ...c }) => c),
    viagens: r.viagens.map(v => ({
      data: v.data, placa: v.placa, motorista: v.motorista, destino: v.destino,
      entregas: v.entregas, naOrdem: v.naOrdem, pct: v.pct, invertida: v.invertida, kmExtra: v.kmExtra,
      fila: v.sequencia.map(s => [s.planejada, s.naOrdem] as [number, boolean]),
      naoFeitas: v.naoFeitasLista.map(n => n.planejada),
    })),
  }
}
