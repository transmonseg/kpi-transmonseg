// 09/11 (pedido do dono, caso Portogalo/Angra da tia Érica): a conferência da
// operação (kpi_nf_resolucao) vale na tela do Ao vivo NA HORA, sem esperar o
// próximo cálculo. Aplicada por cima do resultado guardado na hora de servir
// (o cálculo guardado continua sendo o automático -- nada é sobrescrito):
//   - entregue/conferida/outra placa -> situação "entregue";
//   - não esteve no local            -> "nao_foi";
//   - ponto do cliente errado        -> "fora_da_conta".
// A taxa do topo, o progresso das placas e o "faltam N" andam junto.
import type { NfAoVivo, PlacaAoVivo, SituacaoNf } from './ao-vivo'
import type { ResolucaoNf } from './types'
import { RESOLUCOES_CONFIRMATORIAS } from './resolucoes-regras'

/** Linha mínima de resolução vigente (da tabela ou da tela). */
export type ConferenciaVigente = { nf: string; resolucao: ResolucaoNf; responsavel: string; criadoEm: string; placaExecutora?: string | null }

type Resumo = { taxa: number | null; entregues: number | null; nfsNaConta: number | null; aguardando: number; totalNfs: number; feitas: number; pct: number }
type ComPlacas = { calculadoEm: string; resumo: Resumo; placas: PlacaAoVivo[] }

const ROTULO: Partial<Record<ResolucaoNf, string>> = {
  entregue: 'Entregue com comprovante',
  entregue_tempo_conferido: 'Entregue (tempo conferido)',
  entregue_rastro_oscilante: 'Entregue (rastro oscilante)',
  entregue_outra_placa: 'Entregue por outra placa',
  confirmada_operacao: 'Entregue (conferida)',
  nao_esteve_no_local: 'Não esteve no local (conferido)',
  desatualizado: 'Ponto do cliente errado',
}

export function situacaoDaConferencia(r: ResolucaoNf): SituacaoNf | null {
  if (RESOLUCOES_CONFIRMATORIAS.has(r)) return 'entregue'
  if (r === 'nao_esteve_no_local') return 'nao_foi'
  if (r === 'desatualizado') return 'fora_da_conta'
  return null
}

const correta = (s: SituacaoNf) => s === 'entregue' || s === 'sem_rastreador'
const naConta = (s: SituacaoNf) => s !== 'fora_da_conta' && s !== 'pendente'

/** Marca do resultado para o cache da tela (?tenho=): muda quando entra
 *  conferência nova, mesmo sem cálculo novo. */
export function marcaDoResultado(calculadoEm: string, conferencias: ConferenciaVigente[]): string {
  if (!conferencias.length) return calculadoEm
  const ultima = conferencias.reduce((m, c) => (c.criadoEm > m ? c.criadoEm : m), '')
  return `${calculadoEm}#${conferencias.length}-${ultima}`
}

/** Aplica as conferências vigentes (uma por NF, "desfeita" já tirada) num
 *  resultado do Ao vivo. Puro: devolve cópia (o histórico vem de cache). */
export function aplicarConferenciasAoVivo<R extends ComPlacas>(r: R, conferencias: ConferenciaVigente[]): R & { marca: string } {
  const marca = marcaDoResultado(r.calculadoEm, conferencias)
  if (!conferencias.length) return { ...r, marca }
  const porNf = new Map(conferencias.map(c => [c.nf, c]))
  const resumo = { ...r.resumo }
  let dEntregues = 0, dConta = 0, dAguardando = 0, mudou = false
  const placas = r.placas.map(p => {
    let mexeu = false
    const nfs = p.nfs.map((n): NfAoVivo => {
      const c = porNf.get(n.nf)
      if (!c) return n
      const nova = situacaoDaConferencia(c.resolucao)
      if (!nova) return n
      mexeu = true
      const antiga = n.situacao
      if (nova !== antiga) {
        dEntregues += (naConta(nova) && correta(nova) ? 1 : 0) - (naConta(antiga) && correta(antiga) ? 1 : 0)
        dConta += (naConta(nova) ? 1 : 0) - (naConta(antiga) ? 1 : 0)
        if (antiga === 'pendente') dAguardando--
      }
      const rotulo = c.resolucao === 'entregue_outra_placa' && c.placaExecutora ? `${ROTULO[c.resolucao]} (${c.placaExecutora})` : ROTULO[c.resolucao] ?? c.resolucao
      return { ...n, situacao: nova, conferencia: { resolucao: c.resolucao, rotulo, responsavel: c.responsavel, em: c.criadoEm, situacaoAutomatica: antiga } }
    })
    if (!mexeu) return p
    mudou = true
    const feitas = nfs.filter(n => n.situacao === 'entregue').length
    return { ...p, nfs, feitas, pct: nfs.length ? Math.round((100 * feitas) / nfs.length) : 0 }
  })
  if (!mudou) return { ...r, marca }
  const feitas = placas.reduce((s, p) => s + p.feitas, 0)
  resumo.feitas = feitas
  resumo.pct = resumo.totalNfs ? Math.round((100 * feitas) / resumo.totalNfs) : 0
  resumo.aguardando = Math.max(0, (resumo.aguardando ?? 0) + dAguardando)
  if (resumo.entregues != null && resumo.nfsNaConta != null) {
    resumo.entregues += dEntregues
    resumo.nfsNaConta += dConta
    resumo.taxa = resumo.nfsNaConta > 0 ? Math.round((1000 * resumo.entregues) / resumo.nfsNaConta) / 10 : null
  }
  return { ...r, placas, resumo, marca }
}
