// D-03/D-04 (plano mestre 23/10, OK do dono 23/10 23:10): placa da escala
// que nao identifica um carro real da frota.
// - fora_da_frota (D-03): placa que nao existe na frota Unitrac (RQO5E38 do
//   carro 16, certo TOS5E38; RQU8A12 -> RQV8A12). Continua "sem rastreador =
//   correta" (regra do dono 29/09/04/10), com o rotulo "PLACA FORA DA FROTA —
//   CONFIRMAR A PLACA REAL" e a placa provavel do F1-04 (sugerir-trocas.ts,
//   sempre confirmada pelo GPS).
// - provisoria (D-04): placa declarada provisoria pela operacao em
//   kpi_placa_sem_rastreador (LLD4202: "o Nelson põe nas cargas de RETIRADA
//   quando ainda não sabe o carro"). Fora da taxa ate a operacao informar o
//   carro (troca de placa no Ao vivo).
// - ficticia (D-04): placa de preenchimento (XXX0000 na Nutry; a XXX5678 da
//   Fusion ja' vira carga sem placa em fonte-fusion.ts). Fora da taxa.
import { normPlaca } from '@/lib/unitrac-api'
import type { LinhaDetalheEntrega, SituacaoPlaca } from './types'

export type { SituacaoPlaca } from './types'

/** Placa de preenchimento: nao e' veiculo nenhum. Mesmo criterio de
 *  `placaFicticia` em kpi-rioquality/fonte-fusion.ts (repetido aqui para nao
 *  puxar o cliente da Fusion para o gerador). */
export function placaFicticia(placa: string): boolean {
  return /^XXX/.test(normPlaca(placa ?? ''))
}

export const STATUS_PLACA_PROVISORIA = 'PLACA PROVISÓRIA - FORA DA CONTA ATÉ A OPERAÇÃO INFORMAR O CARRO'
export const STATUS_PLACA_FICTICIA = 'PLACA FICTÍCIA - FORA DA CONTA ATÉ A OPERAÇÃO INFORMAR O CARRO'
/** Prefixos do STATUS (resumo-dashboard, ao-vivo, relatorio-pendentes). */
export const PREFIXOS_STATUS_PLACA_FORA_DA_CONTA = ['PLACA PROVISÓRIA', 'PLACA FICTÍCIA']
export const MOTIVO_PLACA_FORA_DA_FROTA = 'PLACA FORA DA FROTA — CONFIRMAR A PLACA REAL'

/** Situacao da placa da NF: a marca do chamador (gerar-nutrimax) ou, sem ela,
 *  ficticia pela propria placa. Carga sem placa nunca tem situacao. */
export function situacaoDaPlaca(d: Pick<LinhaDetalheEntrega, 'placa' | 'situacaoPlaca'>): SituacaoPlaca | null {
  if (!d.placa) return null
  if (d.situacaoPlaca) return d.situacaoPlaca
  return placaFicticia(d.placa) ? 'ficticia' : null
}

export type ContextoSituacaoPlaca = {
  /** Placas (normalizadas) declaradas provisorias no dia (placasProvisoriasNoDia). */
  provisorias: Set<string>
  /** A placa tem cv na frota Unitrac (ja' com o alias O/0 e I/1). */
  temCv: (placaNorm: string) => boolean
  /** Sugestoes do F1-04 (sugerir-trocas.ts) do dia. */
  sugestoes?: { carga: string; placaEscala: string; placaSugerida: string }[]
}

/** Marca cada NF com a situacao da placa (copia; o original nao muda). */
export function marcarSituacaoPlaca(detalhe: LinhaDetalheEntrega[], ctx: ContextoSituacaoPlaca): LinhaDetalheEntrega[] {
  const sugerida = new Map<string, string>()
  for (const s of ctx.sugestoes ?? []) {
    if (s.placaEscala) sugerida.set(`${s.carga}::${normPlaca(s.placaEscala)}`, normPlaca(s.placaSugerida))
  }
  return detalhe.map(d => {
    const p = normPlaca(d.placa ?? '')
    if (!p) return d
    let situacaoPlaca: SituacaoPlaca | null = null
    if (placaFicticia(p)) situacaoPlaca = 'ficticia'
    else if (ctx.provisorias.has(p)) situacaoPlaca = 'provisoria'
    else if (!ctx.temCv(p)) situacaoPlaca = 'fora_da_frota'
    if (!situacaoPlaca) return d
    const sug = situacaoPlaca === 'fora_da_frota' ? sugerida.get(`${d.carga}::${p}`) : undefined
    return { ...d, situacaoPlaca, ...(sug ? { placaSugerida: sug } : {}) }
  })
}
