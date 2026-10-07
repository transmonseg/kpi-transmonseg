// Investigação das NFs não entregues (06/10, pedido: "a investigação de todas
// as placas que não entregaram", todo dia). Feita a cada cálculo do Ao vivo e
// no fechamento do dia, com as paradas da Unitrac que o próprio KPI usou: a
// parada mais perto do cliente em todo o dia diz se o carro esteve lá e o KPI
// não contou (<= 150 m), se parou perto/na região (endereço ou coordenada
// suspeitos) ou se nem chegou perto. Não muda a classificação do KPI.
import type { NfAoVivo, PlacaAoVivo } from './ao-vivo'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import { haversine } from '@/lib/utils/geo'
import { normPlaca } from '@/lib/unitrac-api/frota'

export type CategoriaInvestigacao = 'parou_no_cliente' | 'parou_perto' | 'parou_na_regiao' | 'nao_chegou_perto' | 'sem_gps' | 'sem_coordenada'

export type Investigacao = {
  categoria: CategoriaInvestigacao
  /** Distância da parada (fora da base) mais perto do ponto do cliente. */
  distM: number | null
  hora: string | null // HH:MM (Brasília)
  minutos: number | null
}

const NO_CLIENTE_M = 150
const PERTO_M = 500
const REGIAO_M = 2000

const VAZIA = (categoria: CategoriaInvestigacao): Investigacao => ({ categoria, distM: null, hora: null, minutos: null })

export function investigarNf(n: NfAoVivo, paradas: UnitracParadaRow[]): Investigacao {
  if (n.situacao === 'sem_rastreador') return VAZIA('sem_gps')
  if (n.lat == null || n.lng == null) return VAZIA('sem_coordenada')
  let melhor: { d: number; p: UnitracParadaRow } | null = null
  for (const p of paradas) {
    const q = p as UnitracParadaRow & { lat?: number | null; lng?: number | null }
    if (q.classificacao === 'BASE' || q.lat == null || q.lng == null) continue
    const d = haversine(n.lat, n.lng, q.lat, q.lng)
    if (!melhor || d < melhor.d) melhor = { d, p }
  }
  if (!melhor) return VAZIA('sem_gps')
  const d = Math.round(melhor.d)
  // Horário da Unitrac é Brasília mascarado como UTC: o HH:MM do ISO já é o de Brasília.
  const ini = Date.parse(melhor.p.chegada)
  const fim = Date.parse(melhor.p.fim_real ?? melhor.p.saida ?? melhor.p.chegada)
  const categoria: CategoriaInvestigacao = d <= NO_CLIENTE_M ? 'parou_no_cliente' : d <= PERTO_M ? 'parou_perto' : d <= REGIAO_M ? 'parou_na_regiao' : 'nao_chegou_perto'
  return { categoria, distM: d, hora: melhor.p.chegada.slice(11, 16), minutos: Number.isFinite(fim - ini) ? Math.max(0, Math.round((fim - ini) / 60_000)) : null }
}

/** Preenche `investigacao` em toda NF não entregue (pendente também: mostra
 *  no detalhe se o carro já passou por lá). */
export function investigarPlacas(placas: PlacaAoVivo[], paradasPorPlaca: Map<string, UnitracParadaRow[]>): void {
  for (const p of placas) {
    const paradas = paradasPorPlaca.get(normPlaca(p.placa)) ?? []
    for (const n of p.nfs) if (n.situacao !== 'entregue') n.investigacao = investigarNf(n, paradas)
  }
}
