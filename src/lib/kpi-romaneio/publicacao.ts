// KPI-05 (auditoria 03/11): o fechamento das 00:30 publicava sozinho como
// oficial mesmo com a ponte, o coletor ou o geocode incompletos (so' olhava
// fonte_indisponivel). Aqui fica a regra do que impede publicar; o fechamento
// sai "provisório" com o motivo e o tick repete.
import type { AvisoDescasamento } from './types'
import { textoAviso } from './gerador-xlsx'

/** Decisão 03/11 (coordenador, frente K): geocode parcial só bloqueia acima
 *  de 2% das NFs do dia -- o Photon tem ~130 timeouts/dia e o fechamento não
 *  pode ficar provisório todo dia. Abaixo disso vira aviso visível. */
export const LIMITE_GEOCODE_PARCIAL_BLOQUEIA = 0.02

const SEMPRE_BLOQUEIAM = new Set<AvisoDescasamento['motivo']>(['ponte_falhou', 'coletor_fora', 'consulta_posicoes_suspeita'])

/** Avisos que impedem o fechamento de publicar sozinho como oficial.
 *  `totalNfs` = NFs do dia (base do limite do geocode parcial). Território
 *  fora não entra: tem a reconferência própria das 05:30 (F1-11). */
export function avisosQueBloqueiamPublicacao(avisos: AvisoDescasamento[], totalNfs: number): AvisoDescasamento[] {
  return avisos.filter(a => {
    if (SEMPRE_BLOQUEIAM.has(a.motivo)) return true
    if (a.motivo === 'fonte_indisponivel') return a.fonte !== 'territorio'
    if (a.motivo === 'geocode_parcial') {
      const n = a.enderecosParciais ?? 0
      return n > 0 && (totalNfs <= 0 || n / totalNfs > LIMITE_GEOCODE_PARCIAL_BLOQUEIA)
    }
    return false
  })
}

/** Início de ultimo_erro quando o fechamento ficou provisório (o tick repete). */
export const PREFIXO_FECHAMENTO_PROVISORIO = 'Fechamento provisório'

export function textoFechamentoProvisorio(motivos: string[]): string {
  return `${PREFIXO_FECHAMENTO_PROVISORIO}: não foi para o Dashboard porque o cálculo saiu incompleto (${motivos.join('; ')}). O próximo cálculo tenta de novo.`
}

/** Texto dos avisos que bloqueiam (mesmo texto da aba Avisos). */
export function motivosDoBloqueio(bloqueios: AvisoDescasamento[]): string[] {
  return [...new Set(bloqueios.map(textoAviso))]
}

/** Até quando o tick repete um fechamento provisório: 12:00 BRT de D+1.
 *  Depois fica provisório para a operação olhar (oferta no Dashboard). */
const REPETE_ATE = '12:00'

const instanteBR = (data: string, diasDepois: number, hhmm: string) => {
  const [a, m, d] = data.split('-').map(Number)
  return Date.parse(`${new Date(Date.UTC(a, m - 1, d + diasDepois)).toISOString().slice(0, 10)}T${hhmm}:00-03:00`)
}

/** O último cálculo de `data` deixou o fechamento provisório e ainda é a
 *  manhã de D+1: o tick calcula de novo (como precisaReconferirTerritorio). */
export function precisaRepetirFechamentoProvisorio(
  row: { calculado_em: string | null; ultimo_erro: string | null; ultimo_erro_em: string | null },
  data: string, agoraMs: number,
): boolean {
  if (!row.calculado_em || !row.ultimo_erro_em || !row.ultimo_erro?.includes(PREFIXO_FECHAMENTO_PROVISORIO)) return false
  if (Date.parse(row.ultimo_erro_em) < Date.parse(row.calculado_em)) return false
  return agoraMs >= instanteBR(data, 1, '00:30') && agoraMs < instanteBR(data, 1, REPETE_ATE)
}
