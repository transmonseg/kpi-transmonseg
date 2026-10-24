// Carro trocado sem aviso (06/10: PAO-2/3/5 e Petrópolis 3 rodados por carros
// fora da escala enquanto o escalado ficou na base/oficina -- achados na mão
// pelo GPS). Sugere a troca pra operação confirmar no Ao vivo: nunca aplica
// sozinho.
//
// Plano mestre 23/10:
// - F1-02 (KN-02): troca mútua e carga absorvida por carro com carga própria
//   grande (16/10 TOS0G53 -> RBI0J25; 17/10 UNN6G81 <-> RQV5F67).
// - F1-03 (KN-01): carga do pão SEM PLACA = "escalado não passou"; sugere o
//   carro livre que parou nos endereços (22/10 PAO-6 -> RQM4C16).
// - F1-04 (KN-03 a/b): placa fora da frota (RQO5E38) e troca recorrente: os
//   candidatos vêm do histórico confirmado e do final da placa, sempre
//   confirmados pelo GPS.
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import { haversine } from '@/lib/utils/geo'
import { normPlaca } from '@/lib/unitrac-api'

/** Por que a sugestão existe (texto da tela). */
export type MotivoSugestao = 'livre' | 'absorvida' | 'mutua' | 'sem_placa' | 'fora_da_frota'

export type SugestaoTroca = {
  carga: string
  /** '' = carga do pão que veio sem placa (F1-03). */
  placaEscala: string
  placaSugerida: string
  enderecosVisitados: number
  enderecosDaCarga: number
  /** 'mutua' = placaEscala <-> placaSugerida (placa inteira, os dois lados). */
  modo?: 'redirecionar' | 'mutua'
  motivo?: MotivoSugestao
  /** Dias anteriores em que a operação confirmou essa mesma troca. */
  confirmadaAntes?: number
  /** F1-04 (a): confirmada em >= 2 dias -- "troca recorrente". */
  recorrente?: boolean
}

/** Troca já confirmada pela operação em outro dia (kpi_troca_placa). */
export type TrocaConfirmada = { data: string; carga: string | null; placaEscala: string; placaReal: string }

export type ContextoSugestao = {
  /** Placas da frota (Unitrac). Placa da escala fora dela = digitada errada (F1-04). */
  frota?: string[]
  /** Trocas confirmadas em dias ANTERIORES (o dia corrente fica de fora). */
  historico?: TrocaConfirmada[]
  /** F1-04 (b): placas que o mesmo número de carro do JAC já teve (carga do pão -> placas). */
  placasDoCarroPorCarga?: Map<string, string[]>
}

type PontoCarga = { carga: string; placa: string; endereco: string; lat: number; lng: number }

const RAIO_ENDERECO_M = 400 // 250 perdia PAO-5 06/10 (RQM4C16 a 260-400 m de 3 dos 5)
const MIN_ENDERECOS = 2
const FRACAO_MIN = 0.5
const FRACAO_MAX_ESCALADO = 0.2
// Carro com carga propria pequena perto da carga que teria rodado (08/10:
// RQV5F67 com 1 NF rodou as 21 do UNN6G81) -- "livre" pra efeito do texto.
const MAX_ENDERECOS_PROPRIOS_ABS = 2
const FRACAO_MAX_PROPRIA = 0.25
// F1-02: carro com carga propria GRANDE so' e' candidato quando o que ele
// fez na carga do outro NAO se explica pela propria rota: conta so' os
// enderecos da carga a mais que isso de qualquer endereco proprio dele (caso
// 08/10 "carro com carga propria grande (fez a sua)": vizinhos de porta).
const RAIO_PROPRIO_M = 1000
const RECORRENTE_MIN_DIAS = 2

const paradasForaDaBase = (ps: UnitracParadaRow[]) =>
  ps.filter((p): p is UnitracParadaRow & { lat: number; lng: number } => p.classificacao === 'FORA_BASE' && p.lat != null && p.lng != null)

type Endereco = { lat: number; lng: number }

/** Para cada carga em que o carro da escala passou em no máximo 20% dos
 *  endereços (ou que veio sem placa), procura o carro que parou em mais
 *  endereços da carga (<= RAIO_ENDERECO_M). Sugere só com >= MIN_ENDERECOS e
 *  >= metade dos endereços. Candidato já confirmado pela operação (histórico,
 *  final da placa fora da frota, mesmo carro do JAC) tem prioridade quando o
 *  GPS confirma; senão vale o 1º colocado sem empate. */
export function sugerirTrocas(pontos: PontoCarga[], paradasPorPlaca: Map<string, UnitracParadaRow[]>, ctx: ContextoSugestao = {}): SugestaoTroca[] {
  const frota = ctx.frota ? new Set(ctx.frota.map(normPlaca)) : null
  const enderecosProprios = new Map<string, Map<string, Endereco>>()
  for (const p of pontos) {
    if (!p.placa) continue
    const m = enderecosProprios.get(p.placa) ?? new Map<string, Endereco>()
    if (!m.has(p.endereco)) m.set(p.endereco, { lat: p.lat, lng: p.lng })
    enderecosProprios.set(p.placa, m)
  }
  const porCarga = new Map<string, PontoCarga[]>()
  for (const p of pontos) porCarga.set(p.carga, [...(porCarga.get(p.carga) ?? []), p])
  const paradasFb = new Map<string, (UnitracParadaRow & { lat: number; lng: number })[]>()
  const fb = (placa: string) => {
    let v = paradasFb.get(placa)
    if (!v) { v = paradasForaDaBase(paradasPorPlaca.get(placa) ?? []); paradasFb.set(placa, v) }
    return v
  }
  const visitou = (placa: string, enderecos: Endereco[]) => {
    const ps = fb(placa)
    return enderecos.filter(e => ps.some(s => haversine(e.lat, e.lng, s.lat, s.lng) <= RAIO_ENDERECO_M)).length
  }

  const out: SugestaoTroca[] = []
  for (const [carga, ps] of porCarga) {
    const placaEscala = ps[0].placa
    const enderecosMap = new Map<string, Endereco>()
    for (const p of ps) if (!enderecosMap.has(p.endereco)) enderecosMap.set(p.endereco, { lat: p.lat, lng: p.lng })
    const enderecos = [...enderecosMap.values()]
    const total = enderecos.length
    if (total < MIN_ENDERECOS) continue
    // Escalado praticamente nao passou na carga (06/10, TTI6E49: andou 300 m
    // ate' a rua da base -- "sem parada fora da base" nao pegava). Sem placa
    // (F1-03) = escalado nao passou.
    const doEscalado = placaEscala ? visitou(placaEscala, enderecos) : 0
    if (doEscalado > FRACAO_MAX_ESCALADO * total) continue
    const passa = (v: number) => v >= MIN_ENDERECOS && v >= FRACAO_MIN * total && v >= doEscalado + MIN_ENDERECOS

    // Quanto cada carro fez da carga. Carga propria grande: so' conta o que
    // fica longe da propria rota (F1-02).
    const candidatos = [...paradasPorPlaca.keys()].filter(p => p && p !== placaEscala)
    const ranking = candidatos.map(placa => {
      const proprios = [...(enderecosProprios.get(placa)?.values() ?? [])]
      const pequena = proprios.length <= Math.max(MAX_ENDERECOS_PROPRIOS_ABS, FRACAO_MAX_PROPRIA * total)
      const visitados = visitou(placa, enderecos)
      if (pequena || visitados === 0) return { placa, visitados, pequena }
      const longe = enderecos.filter(e => !proprios.some(o => haversine(e.lat, e.lng, o.lat, o.lng) <= RAIO_PROPRIO_M))
      const foraDaRota = visitou(placa, longe)
      return { placa, visitados: foraDaRota >= MIN_ENDERECOS && foraDaRota >= FRACAO_MIN * longe.length ? visitados : 0, pequena }
    }).sort((a, b) => b.visitados - a.visitados || a.placa.localeCompare(b.placa))

    // Prioridade: o que a operação ja' confirmou (F1-02/F1-03/F1-04).
    const confirmadas = diasConfirmados(ctx.historico ?? [], carga, placaEscala)
    const prioritarias = new Set(confirmadas.keys())
    const foraDaFrota = !!placaEscala && !!frota && !frota.has(placaEscala)
    if (foraDaFrota) for (const p of completarPorFinal(placaEscala, frota!)) prioritarias.add(p)
    for (const p of ctx.placasDoCarroPorCarga?.get(carga) ?? []) prioritarias.add(normPlaca(p))
    prioritarias.delete(placaEscala)

    // Sem prioridade: 1o o carro livre/de carga pequena (regra antiga, nada
    // do que ja' saia muda); so' sem vencedor ali entra o de carga grande
    // (carga absorvida / troca mutua, F1-02). Empate = nao sugere.
    const vencedor = (lista: typeof ranking) => {
      const [primeiro, segundo] = lista
      if (!primeiro || !passa(primeiro.visitados)) return undefined
      if (segundo && segundo.visitados === primeiro.visitados) return null
      return primeiro
    }
    const comPrioridade = ranking.filter(r => prioritarias.has(r.placa) && passa(r.visitados))
    let melhor = comPrioridade[0]
    if (!melhor) {
      const livre = vencedor(ranking.filter(r => r.pequena))
      if (livre === null) continue
      const escolhido = livre ?? vencedor(ranking.filter(r => !r.pequena))
      if (!escolhido) continue
      melhor = escolhido
    }

    // Troca mutua: o escalado desta carga fez a carga propria do sugerido.
    const propriosSugerido = [...(enderecosProprios.get(melhor.placa)?.values() ?? [])]
    const mutua = !!placaEscala && !melhor.pequena && propriosSugerido.length >= MIN_ENDERECOS
      && visitou(placaEscala, propriosSugerido) >= Math.max(MIN_ENDERECOS, FRACAO_MIN * propriosSugerido.length)
    const motivo: MotivoSugestao = mutua ? 'mutua' : !placaEscala ? 'sem_placa' : foraDaFrota ? 'fora_da_frota' : melhor.pequena ? 'livre' : 'absorvida'
    const dias = confirmadas.get(melhor.placa) ?? 0
    out.push({
      carga, placaEscala, placaSugerida: melhor.placa, enderecosVisitados: melhor.visitados, enderecosDaCarga: total,
      modo: mutua ? 'mutua' : 'redirecionar', motivo,
      ...(dias > 0 ? { confirmadaAntes: dias } : {}),
      ...(dias >= RECORRENTE_MIN_DIAS ? { recorrente: true } : {}),
    })
  }
  // Mutua aparece uma vez so' (A<->B cobre a carga de B tambem).
  const mutuas = out.filter(s => s.modo === 'mutua')
  return out.filter(s => s.modo === 'mutua'
    ? !mutuas.some(m => m !== s && m.placaEscala === s.placaSugerida && m.placaSugerida === s.placaEscala && m.carga < s.carga)
    : !mutuas.some(m => m.placaEscala === s.placaSugerida && m.placaSugerida === s.placaEscala))
}

/** Dias distintos em que a operação confirmou cada placa real pra esta carga:
 *  pela placa da escala (RQO5E38 -> TOS5E38 em 15, 21, 22/10) ou, na carga do
 *  pão sem placa, pelo número da carga (PAO-6 -> RQM4C16 em 08 e 13/10). */
function diasConfirmados(historico: TrocaConfirmada[], carga: string, placaEscala: string): Map<string, number> {
  const dias = new Map<string, Set<string>>()
  for (const t of historico) {
    const escala = normPlaca(t.placaEscala ?? '')
    // Sem placa: o carro que ja' rodou a MESMA carga do pao (PAO-6 TTI6E49 ->
    // RQM4C16 em 08 e 13/10), qualquer que fosse a placa da escala naquele dia.
    const casa = placaEscala ? escala === placaEscala : (t.carga ?? '').trim() === carga
    if (!casa) continue
    const real = normPlaca(t.placaReal)
    if (!real) continue
    dias.set(real, (dias.get(real) ?? new Set()).add(t.data))
  }
  return new Map([...dias].map(([p, d]) => [p, d.size]))
}

/** F1-04 (b): placa fora da frota -> placa da frota com o mesmo final de 4
 *  (RQO5E38 -> TOS5E38), só quando o final é único na frota. */
export function completarPorFinal(placa: string, frota: Set<string>): string[] {
  const p = normPlaca(placa)
  if (p.length < 4) return []
  const fim = p.slice(-4)
  const achadas = [...frota].filter(f => f !== p && f.endsWith(fim))
  return achadas.length === 1 ? achadas : []
}

type LinhaComCarro = { carga: string; placa: string; numeroCarro?: string }

/** F1-04 (KN-03 b): pra cada carga de hoje com número de carro do JAC, as
 *  placas DA FROTA que esse mesmo carro usou nos dias anteriores (com a troca
 *  confirmada daquele dia aplicada), mais recente primeiro. Nunca vira troca
 *  sozinha: entra só como candidato prioritário, que o GPS ainda confirma
 *  (o carro 36 já foi RBI1J86, TTI9B98 e RQV8J31). */
export function placasDoCarroPorCarga(
  hoje: LinhaComCarro[],
  anteriores: { data: string; linhas: LinhaComCarro[] }[],
  trocas: TrocaConfirmada[],
  frota: string[],
): Map<string, string[]> {
  const naFrota = new Set(frota.map(normPlaca))
  const porCarro = new Map<string, string[]>()
  for (const dia of [...anteriores].sort((a, b) => b.data.localeCompare(a.data))) {
    const doDia = trocas.filter(t => t.data === dia.data)
    for (const l of dia.linhas) {
      if (!l.numeroCarro) continue
      const placa = normPlaca(l.placa ?? '')
      const troca = [...doDia].reverse().find(t => normPlaca(t.placaEscala ?? '') === placa && (!t.carga || t.carga.trim() === l.carga))
      const real = troca ? normPlaca(troca.placaReal) : placa
      if (!real || !naFrota.has(real)) continue
      const lista = porCarro.get(l.numeroCarro) ?? []
      if (!lista.includes(real)) lista.push(real)
      porCarro.set(l.numeroCarro, lista)
    }
  }
  const out = new Map<string, string[]>()
  for (const l of hoje) {
    const placas = l.numeroCarro ? porCarro.get(l.numeroCarro) : undefined
    if (placas?.length && !out.has(l.carga)) out.set(l.carga, placas)
  }
  return out
}
