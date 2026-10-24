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
import { PREFIXO_OBS_SEM_SINAL_NO_TRECHO } from './buraco-sinal'

export type CategoriaInvestigacao = 'parou_no_cliente' | 'parou_perto' | 'passou_sem_parar' | 'parou_na_regiao' | 'nao_chegou_perto' | 'sem_gps' | 'sem_coordenada' | 'sem_sinal_no_trecho' | 'ponto_impreciso'

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

// GN-07/KM-11 (auditoria 20/10): so' paradas nao bastam -- o carro que passou
// a 191 m sem parar saia "nao chegou perto 3.242 m", contradizendo o KPI
// ("PASSOU NO ENDERECO"). `trajetoM` = menor distancia do GPS continuo.
export function investigarNf(n: NfAoVivo, paradas: UnitracParadaRow[], trajetoM?: number | null): Investigacao {
  if (n.situacao === 'sem_rastreador') return VAZIA('sem_gps')
  // F2-07 (KN-05): o KPI viu o buraco de sinal no trecho do cliente -- a
  // parada mais perto nao diz nada (o carro andou sem ser visto).
  if (n.status.startsWith(PREFIXO_OBS_SEM_SINAL_NO_TRECHO)) return VAZIA('sem_sinal_no_trecho')
  if (n.lat == null || n.lng == null) return VAZIA('sem_coordenada')
  let melhor: { d: number; p: UnitracParadaRow } | null = null
  for (const p of paradas) {
    const q = p as UnitracParadaRow & { lat?: number | null; lng?: number | null }
    if (q.classificacao === 'BASE' || q.lat == null || q.lng == null) continue
    const d = haversine(n.lat, n.lng, q.lat, q.lng)
    if (!melhor || d < melhor.d) melhor = { d, p }
  }
  const passou = trajetoM != null && trajetoM <= PERTO_M && (!melhor || melhor.d > PERTO_M)
  if (passou) return { categoria: 'passou_sem_parar', distM: Math.round(trajetoM), hora: null, minutos: null }
  if (!melhor) return VAZIA('sem_gps')
  const d = Math.round(melhor.d)
  // Horário da Unitrac é Brasília mascarado como UTC: o HH:MM do ISO já é o de Brasília.
  const ini = Date.parse(melhor.p.chegada)
  const fim = Date.parse(melhor.p.fim_real ?? melhor.p.saida ?? melhor.p.chegada)
  // F2-REV-04: ponto nao confiavel (so' a rua, fallback do monitoramento) nao
  // sustenta "nao passou"/"so' na regiao" -- mesma regra do KPI, que nunca
  // afirma NAO FOI com ele. Parada perto continua (e' so' um "conferir").
  if (n.pontoImpreciso && d > PERTO_M) return VAZIA('ponto_impreciso')
  const categoria: CategoriaInvestigacao = d <= NO_CLIENTE_M ? 'parou_no_cliente' : d <= PERTO_M ? 'parou_perto' : d <= REGIAO_M ? 'parou_na_regiao' : 'nao_chegou_perto'
  return { categoria, distM: d, hora: melhor.p.chegada.slice(11, 16), minutos: Number.isFinite(fim - ini) ? Math.max(0, Math.round((fim - ini) / 60_000)) : null }
}

/** Preenche `investigacao` em toda NF não entregue (pendente também: mostra
 *  no detalhe se o carro já passou por lá). */
export function investigarPlacas(placas: PlacaAoVivo[], paradasPorPlaca: Map<string, UnitracParadaRow[]>, trajetoPorNf: Map<string, number> = new Map()): void {
  for (const p of placas) {
    const paradas = paradasPorPlaca.get(normPlaca(p.placa)) ?? []
    for (const n of p.nfs) if (n.situacao !== 'entregue') n.investigacao = investigarNf(n, paradas, trajetoPorNf.get(n.nf))
  }
}

/** F2-03 (KRQ-04): alarme de falha silenciosa. Nenhuma NF do cliente com
 *  ponto (lat) no cálculo = o ponto não chegou ao Ao vivo (RQ de 20 a 23/10:
 *  0 de 11.382, e a investigação dizia "endereço não localizado" em 100% das
 *  não entregues sem nenhum erro registrado). null = há ponto em alguma NF. */
export function alarmeSemCoordenada(placas: PlacaAoVivo[]): string | null {
  const nfs = placas.flatMap(p => p.nfs)
  // F2-REV-04: ponto nao confiavel nao conta como "com coordenada".
  if (nfs.length === 0 || nfs.some(n => n.lat != null && n.lng != null && !n.pontoImpreciso)) return null
  const investigadas = nfs.filter(n => n.investigacao?.categoria === 'sem_coordenada' || n.investigacao?.categoria === 'ponto_impreciso').length
  const imprecisas = nfs.filter(n => n.lat != null && n.pontoImpreciso).length
  return `Nenhuma NF com ponto confiável do cliente neste cálculo (${nfs.length - imprecisas} NFs sem coordenada${imprecisas ? `, ${imprecisas} só com ponto aproximado` : ''}; ${investigadas} não entregues sem investigação pelo ponto) — o mapa e a investigação estão cegos. Avisar o suporte.`
}
