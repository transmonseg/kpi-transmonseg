// 12/11: relatório da Ordem da rota (tela dedicada + planilha). Recebe os dias
// já com aplicarOrdemRota e monta: resumo do período, por dia, por motorista,
// por placa e cada viagem com a sequência completa (planejada x real e
// previsão x chegada). Pura.
import { viagemInvertida } from './ordem-rota'

type NfDia = {
  nf: string; cliente: string; endereco?: string; situacao: string; chegada: string | null
  ordemRota?: { planejada: number; real: number; naOrdem: boolean; romaneio: string; previsao: string | null }
}
type PlacaDia = { placa: string; motorista: string; destino?: string; nfs: NfDia[] }
export type DiaComOrdem = { data: string; placas: PlacaDia[]; /** NFs planejadas por romaneio (da ordem guardada). */ planejadas?: Record<string, number> }

export type EntregaSequencia = {
  real: number; planejada: number; naOrdem: boolean
  nf: string; cliente: string; chegada: string | null; previsao: string | null
}
export type Viagem = {
  data: string; placa: string; motorista: string; destino: string; romaneio: string
  entregas: number; naOrdem: number; pct: number; invertida: boolean
  /** planejadas no romaneio que não foram entregues (ficaram de fora da sequência). */
  naoFeitas: number
  sequencia: EntregaSequencia[]
}
export type Agregado = { chave: string; nome: string; sub: string; entregas: number; naOrdem: number; pct: number; viagens: number; invertidas: number }
export type RelatorioOrdemRota = {
  de: string; ate: string
  total: { entregas: number; naOrdem: number; pct: number; viagens: number; invertidas: number }
  dias: { data: string; entregas: number; naOrdem: number; pct: number; viagens: number }[]
  motoristas: Agregado[]
  placas: Agregado[]
  viagens: Viagem[]
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0)

export function montarRelatorioOrdemRota(dias: DiaComOrdem[], de: string, ate: string): RelatorioOrdemRota {
  const viagens: Viagem[] = []
  for (const d of dias) {
    for (const p of d.placas) {
      const porRomaneio = new Map<string, NfDia[]>()
      for (const n of p.nfs) {
        if (!n.ordemRota) continue
        const l = porRomaneio.get(n.ordemRota.romaneio) ?? []
        l.push(n)
        porRomaneio.set(n.ordemRota.romaneio, l)
      }
      for (const [romaneio, l] of porRomaneio) {
        // Previsão da Fusion só informativa: ela é recalculada quando o motorista
        // inicia a rota no app (RIQ4G11 12/11: 1ª prevista 14:44, entregando
        // desde de manhã) -- não serve de régua de atraso.
        const seq = l.sort((a, b) => a.ordemRota!.real - b.ordemRota!.real).map(n => ({
          real: n.ordemRota!.real, planejada: n.ordemRota!.planejada, naOrdem: n.ordemRota!.naOrdem,
          nf: n.nf, cliente: n.cliente, chegada: n.chegada, previsao: n.ordemRota!.previsao,
        }))
        const ok = seq.filter(s => s.naOrdem).length
        viagens.push({
          data: d.data, placa: p.placa, motorista: p.motorista || 'Motorista não informado', destino: p.destino ?? '', romaneio,
          entregas: seq.length, naOrdem: ok, pct: pct(ok, seq.length), invertida: viagemInvertida(seq.map(s => s.planejada)),
          naoFeitas: Math.max(0, (d.planejadas?.[romaneio] ?? seq.length) - seq.length), sequencia: seq,
        })
      }
    }
  }
  viagens.sort((a, b) => a.data.localeCompare(b.data) || a.pct - b.pct || a.placa.localeCompare(b.placa))

  const agregar = (chave: (v: Viagem) => string, nome: (v: Viagem) => string, sub: (vs: Viagem[]) => string): Agregado[] => {
    const g = new Map<string, Viagem[]>()
    for (const v of viagens) { const k = chave(v); g.set(k, [...(g.get(k) ?? []), v]) }
    return [...g].map(([k, vs]) => {
      const e = vs.reduce((s, v) => s + v.entregas, 0), ok = vs.reduce((s, v) => s + v.naOrdem, 0)
      return {
        chave: k, nome: nome(vs[0]), sub: sub(vs), entregas: e, naOrdem: ok, pct: pct(ok, e), viagens: vs.length,
        invertidas: vs.filter(v => v.invertida).length
      }
    }).sort((a, b) => a.pct - b.pct || b.entregas - a.entregas)
  }
  const unicos = (xs: string[]) => [...new Set(xs)].join(', ')
  const motoristas = agregar(v => v.motorista, v => v.motorista, vs => unicos(vs.map(v => v.placa)))
  const placas = agregar(v => v.placa, v => v.placa, vs => unicos(vs.map(v => v.motorista)))

  const diasR = [...new Set(viagens.map(v => v.data))].sort().map(data => {
    const vs = viagens.filter(v => v.data === data)
    const e = vs.reduce((s, v) => s + v.entregas, 0), ok = vs.reduce((s, v) => s + v.naOrdem, 0)
    return { data, entregas: e, naOrdem: ok, pct: pct(ok, e), viagens: vs.length }
  })
  const e = viagens.reduce((s, v) => s + v.entregas, 0), ok = viagens.reduce((s, v) => s + v.naOrdem, 0)
  return {
    de, ate,
    total: {
      entregas: e, naOrdem: ok, pct: pct(ok, e), viagens: viagens.length, invertidas: viagens.filter(v => v.invertida).length,
    },
    dias: diasR, motoristas, placas, viagens,
  }
}
