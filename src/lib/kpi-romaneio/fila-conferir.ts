// F3-03 (ACH-02, KN-11, KRQ-10): fila "Conferir" do Ao vivo e a taxa "após
// conferência" (D-06: separada da oficial, que continua sendo a do GPS). Sem
// imports de servidor: a tela usa direto. A classificação automática nunca muda
// aqui; a resolução da operação (kpi_nf_resolucao) fica ao lado dela.
import { nfsForaDaConta, type NfAoVivo, type PlacaAoVivo, type SituacaoNf } from './ao-vivo'
import type { ResolucaoNf } from './types'
import type { ResolucaoNfRow } from './resolucoes'
import { CATEGORIAS_INVESTIGACAO, ROTULO_INVESTIGACAO, fraseInvestigacao } from './investigacao-rotulos'
import { RESOLUCOES_CONFIRMATORIAS } from './resolucoes-regras'
import { EMPRESA_NUTRIMAX, EMPRESA_RIOQUALITY } from './constants'

export type ClienteConferencia = 'nutrimax' | 'rioquality'

/** Chave da empresa em kpi_nf_resolucao (a mesma que a geração lê). */
export function empresaDaResolucao(cliente: ClienteConferencia): string {
  return cliente === 'rioquality' ? EMPRESA_RIOQUALITY : EMPRESA_NUTRIMAX
}

export type AcaoConferencia = 'comprovante' | 'nao_esteve' | 'ponto_errado' | 'outra_placa'

export type DefinicaoAcao = {
  acao: AcaoConferencia
  /** Valor do enum do importador (CHECK da migration de 24/09). */
  resolucao: ResolucaoNf
  rotulo: string
  dica: string
  /** D-07: entrega só sobe com canhoto ou foto anexados. */
  exigeComprovante: boolean
  exigePlaca: boolean
}

export const ACOES_CONFERENCIA: readonly DefinicaoAcao[] = [
  { acao: 'comprovante', resolucao: 'entregue', rotulo: 'Entregue — tenho comprovante', dica: 'Anexe o canhoto ou a foto da entrega. Sem anexo não grava.', exigeComprovante: true, exigePlaca: false },
  { acao: 'nao_esteve', resolucao: 'nao_esteve_no_local', rotulo: 'Não esteve no local', dica: 'A nota continua não entregue, agora confirmado pela operação.', exigeComprovante: false, exigePlaca: false },
  { acao: 'ponto_errado', resolucao: 'desatualizado', rotulo: 'Ponto do cliente errado', dica: 'O endereço ou o ponto no mapa está errado. A nota sai da taxa após conferência até o ponto ser corrigido.', exigeComprovante: false, exigePlaca: false },
  { acao: 'outra_placa', resolucao: 'entregue_outra_placa', rotulo: 'Entregue por outra placa', dica: 'Informe a placa que entregou e anexe o comprovante.', exigeComprovante: true, exigePlaca: true },
]

export function acaoConferencia(acao: string | null | undefined): DefinicaoAcao | null {
  return ACOES_CONFERENCIA.find(a => a.acao === acao) ?? null
}

/** Resolução vigente de uma NF como a tela recebe (sem o caminho do arquivo). */
export type ResolucaoTela = {
  id: number
  nf: string
  resolucao: ResolucaoNf
  responsavel: string
  criadoEm: string
  observacao: string | null
  placaExecutora: string | null
  temComprovante: boolean
}

export function paraTela(r: ResolucaoNfRow): ResolucaoTela {
  return { id: r.id, nf: r.nf, resolucao: r.resolucao, responsavel: r.responsavel, criadoEm: r.criado_em, observacao: r.observacao, placaExecutora: r.placa_executora, temComprovante: !!r.documento }
}

const ROTULO_RESOLUCAO: Record<ResolucaoNf, string> = {
  entregue: 'Entregue (comprovante)',
  entregue_tempo_conferido: 'Entregue (tempo de loja conferido)',
  entregue_rastro_oscilante: 'Entregue (rastro oscilante)',
  entregue_outra_placa: 'Entregue por outra placa',
  nao_esteve_no_local: 'Não esteve no local',
  desatualizado: 'Ponto do cliente errado',
}

export function rotuloResolucao(r: Pick<ResolucaoTela, 'resolucao' | 'placaExecutora'>): string {
  const base = ROTULO_RESOLUCAO[r.resolucao]
  return r.resolucao === 'entregue_outra_placa' && r.placaExecutora ? `${base} (${r.placaExecutora})` : base
}

/** "PASSOU NO ENDEREÇO MAS NÃO REGISTROU PARADA - CONFERIR" ->
 *  { motivo: "Passou no endereço mas não registrou parada", acao: "Conferir" }. */
export function motivoLegivel(status: string): { motivo: string; acao: string | null } {
  const frase = (s: string) => {
    const t = s.trim().toLowerCase().replace(/\bunitrac\b/g, 'Unitrac').replace(/\bkpi\b/g, 'KPI')
    return t.charAt(0).toUpperCase() + t.slice(1)
  }
  const partes = status.split(/\s+-\s+/).filter(Boolean)
  const i = partes.findIndex((p, k) => k > 0 && /^(CONFERIR|PERGUNTAR|VERIFICAR)/i.test(p))
  if (i > 0) return { motivo: frase(partes.slice(0, i).join(', ')), acao: frase(partes.slice(i).join(', ')) }
  return { motivo: frase(partes.join(', ')), acao: null }
}

export type ItemFila = {
  placa: string
  nf: NfAoVivo
  /** Todas as NFs da placa (link do mapa com a rota inteira). */
  daPlaca: NfAoVivo[]
  motivo: { motivo: string; acao: string | null }
  titulo: string | null
  frase: string | null
  resolucao: ResolucaoTela | null
}

/** Não entregues que pesam na taxa (mesmo conjunto do "faltam N"). */
const SITUACOES_FILA = new Set<SituacaoNf>(['revisar', 'nao_confirmada', 'nao_foi'])
const chave = (n: { carga: string; nf: string }) => `${n.carga}::${n.nf}`

function foraDaConta(p: PlacaAoVivo): Set<string> {
  const s = nfsForaDaConta(p.nfs)
  for (const n of p.nfs) if (n.situacao === 'fora_da_conta') s.add(chave(n))
  return s
}

/** Mais recente por NF (a API já manda só a vigente; aqui garante). */
function porNf(resolucoes: ResolucaoTela[]): Map<string, ResolucaoTela> {
  const m = new Map<string, ResolucaoTela>()
  for (const r of resolucoes) {
    const ja = m.get(r.nf)
    if (!ja || Date.parse(r.criadoEm) >= Date.parse(ja.criadoEm)) m.set(r.nf, r)
  }
  return m
}

/** Fila do dia. Ordem = efeito provável na meta: primeiro onde o carro esteve
 *  (parou no cliente, parou perto, passou sem parar), do mais perto ao mais
 *  longe; depois o resto pela ordem da investigação; sem investigação no fim.
 *  Toda nota da fila vale 1 na taxa -- a ordem diz por onde começar, não
 *  promete que sobe. */
export function montarFilaConferir(placas: PlacaAoVivo[], resolucoes: ResolucaoTela[]): { pendentes: ItemFila[]; conferidas: ItemFila[] } {
  const vig = porNf(resolucoes)
  const pendentes: (ItemFila & { ordem: number; dist: number })[] = []
  const conferidas: ItemFila[] = []
  for (const p of placas) {
    const fora = foraDaConta(p)
    for (const n of p.nfs) {
      const r = vig.get(n.nf) ?? null
      const naFila = SITUACOES_FILA.has(n.situacao) && !fora.has(chave(n))
      if (!r && !naFila) continue
      const inv = n.investigacao
      const item: ItemFila = {
        placa: p.placa, nf: n, daPlaca: p.nfs, motivo: motivoLegivel(n.status),
        titulo: inv ? ROTULO_INVESTIGACAO[inv.categoria].titulo : null,
        frase: inv ? fraseInvestigacao(inv) : null,
        resolucao: r,
      }
      if (r) { conferidas.push(item); continue }
      pendentes.push({ ...item, ordem: inv ? CATEGORIAS_INVESTIGACAO.indexOf(inv.categoria) : CATEGORIAS_INVESTIGACAO.length, dist: inv?.distM ?? Infinity })
    }
  }
  pendentes.sort((a, b) => a.ordem - b.ordem || a.dist - b.dist || a.placa.localeCompare(b.placa) || a.nf.nf.localeCompare(b.nf.nf))
  conferidas.sort((a, b) => Date.parse(b.resolucao!.criadoEm) - Date.parse(a.resolucao!.criadoEm))
  return { pendentes: pendentes.map(({ ordem: _o, dist: _d, ...x }) => x), conferidas }
}

/** Taxa "após conferência da operação" (D-06) -- a mesma regra da planilha
 *  (gerador-xlsx.ts: entraNoDenominadorPosConferencia / confirmadaAposConferencia):
 *  - "Ponto do cliente errado" (desatualizado) sai da conta;
 *  - nota com resolução entra na conta mesmo se estava fora (carga sem placa,
 *    aguardando) e vale o que a operação disse;
 *  - sem resolução, vale o automático (entregue e sem rastreador são corretas).
 *  A taxa oficial (GPS) não muda. */
export function taxaAposConferencia(placas: PlacaAoVivo[], resolucoes: ResolucaoTela[]): { confirmadas: number; naConta: number; taxa: number | null; conferidas: number } {
  const vig = porNf(resolucoes)
  let confirmadas = 0, naConta = 0, conferidas = 0
  for (const p of placas) {
    const fora = foraDaConta(p)
    for (const n of p.nfs) {
      const r = vig.get(n.nf)
      if (r) conferidas++
      if (r?.resolucao === 'desatualizado') continue
      const contaSemResolucao = n.situacao === 'sem_rastreador' || (!fora.has(chave(n)) && n.situacao !== 'pendente')
      if (!r && !contaSemResolucao) continue
      naConta++
      if (r ? RESOLUCOES_CONFIRMATORIAS.has(r.resolucao) : n.situacao === 'entregue' || n.situacao === 'sem_rastreador') confirmadas++
    }
  }
  return { confirmadas, naConta, taxa: naConta > 0 ? Math.round((1000 * confirmadas) / naConta) / 10 : null, conferidas }
}
