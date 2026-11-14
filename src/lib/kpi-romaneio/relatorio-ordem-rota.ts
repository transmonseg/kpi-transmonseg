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
}
export type Agregado = { chave: string; nome: string; sub: string; entregas: number; naOrdem: number; pct: number; viagens: number; invertidas: number; naoFeitas: number }
export type RelatorioOrdemRota = {
  de: string; ate: string
  total: { entregas: number; naOrdem: number; pct: number; viagens: number; invertidas: number }
  dias: { data: string; entregas: number; naOrdem: number; pct: number; viagens: number }[]
  motoristas: Agregado[]
  placas: Agregado[]
  viagens: Viagem[]
}
export type FiltrosOrdemRota = {
  motoristas?: string[]; placas?: string[]
  /** HH:MM, pela hora de chegada em cada cliente. */
  horaDe?: string | null; horaAte?: string | null
  soForaDaOrdem?: boolean; soInvertidas?: boolean
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0)
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
        viagens.push({
          data: d.data, placa: p.placa, motorista: p.motorista || 'Motorista não informado', destino: p.destino ?? '', romaneio,
          saidaBase: hhmm(p.saidaBase), chegadaBase: hhmm(p.chegadaBase), km: p.km ?? null,
          primeira: seq[0]?.chegada ?? null, ultima: seq[seq.length - 1]?.chegada ?? null,
          entregas: seq.length, naOrdem: ok, pct: pct(ok, seq.length), invertida: viagemInvertida(seq.map(s => s.planejada)),
          naoFeitas: naoFeitasLista.length, naoFeitasLista, sequencia: seq,
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
    return [...g].map(([k, vs]) => ({
      chave: k, nome: k, sub: sub(vs), ...soma(vs), viagens: vs.length,
      invertidas: vs.filter(v => v.invertida).length, naoFeitas: vs.reduce((s, v) => s + v.naoFeitas, 0),
    })).sort((a, b) => a.pct - b.pct || b.entregas - a.entregas)
  }
  const unicos = (xs: string[]) => [...new Set(xs)].join(', ')
  const diasR = [...new Set(viagens.map(v => v.data))].sort().map(data => {
    const vs = viagens.filter(v => v.data === data)
    return { data, ...soma(vs), viagens: vs.length }
  })
  return {
    de, ate,
    total: { ...soma(viagens), viagens: viagens.length, invertidas: viagens.filter(v => v.invertida).length },
    dias: diasR,
    motoristas: agregar(v => v.motorista, vs => unicos(vs.map(v => v.placa))),
    placas: agregar(v => v.placa, vs => unicos(vs.map(v => v.motorista))),
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
