// F2-05 (KRQ-05, OPS-07, KP-11): status da sincronizacao com a Fusion, por
// dia. Antes o erro so' ia para o log do tick (21/10: 10 h sem dado, 61
// "TypeError: fetch failed", ultimo_erro vazio) e o dia subido a mao parava
// de consultar a Fusion sem ninguem perceber (23/10: 0 tentativas).
// Funcoes puras (a tela importa daqui); a gravacao fica em status-fusion-banco.ts.

/** Resultado de uma tentativa: 'ok' (a Fusion respondeu com o dia),
 *  'sem_dados' (respondeu, ainda sem romaneio), 'manual' (dia subido a mao,
 *  a Fusion nao e' consultada) ou 'erro' (nao respondeu). */
export type SituacaoSyncFusion = 'ok' | 'sem_dados' | 'manual' | 'erro'

export type StatusFusion = {
  situacao: SituacaoSyncFusion
  ultimaTentativa: string
  /** Ultima vez que a Fusion respondeu (ok ou sem_dados). */
  ultimoSucesso: string | null
  ultimoErro: string | null
  ultimoErroEm: string | null
  /** Primeira falha da queda atual (null = a Fusion respondeu na ultima vez). */
  falhandoDesde: string | null
  fonteDoDia: 'fusion' | 'manual' | null
  /** Alerta interno ja' preparado/enviado nesta queda. */
  alertaEm: string | null
}

export type EventoSyncFusion = { situacao: SituacaoSyncFusion; em: string; erro?: string | null }

export function proximoStatusFusion(anterior: StatusFusion | null, ev: EventoSyncFusion): StatusFusion {
  const base: StatusFusion = anterior ?? {
    situacao: ev.situacao, ultimaTentativa: ev.em, ultimoSucesso: null, ultimoErro: null, ultimoErroEm: null,
    falhandoDesde: null, fonteDoDia: null, alertaEm: null,
  }
  const s: StatusFusion = { ...base, situacao: ev.situacao, ultimaTentativa: ev.em }
  if (ev.situacao === 'erro') {
    s.ultimoErro = (ev.erro ?? 'erro sem mensagem').slice(0, 300)
    s.ultimoErroEm = ev.em
    s.falhandoDesde = base.situacao === 'erro' && base.falhandoDesde ? base.falhandoDesde : ev.em
    if (base.situacao !== 'erro') s.alertaEm = null
  } else {
    s.falhandoDesde = null
    s.alertaEm = null
    if (ev.situacao === 'ok' || ev.situacao === 'sem_dados') s.ultimoSucesso = ev.em
    if (ev.situacao === 'ok') s.fonteDoDia = 'fusion'
    if (ev.situacao === 'manual') s.fonteDoDia = 'manual'
  }
  return s
}

export function marcarAlertaFusion(s: StatusFusion, em: string): StatusFusion {
  return { ...s, alertaEm: em }
}

export const ALERTA_FUSION_APOS_MIN = 60
const HORA_INICIO_ALERTA_BR = 5
const HORA_FIM_ALERTA_BR = 21

/** HH:MM no horario de Brasilia. */
export function hhmmBR(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
}
function horaBR(ms: number): number {
  return Number(new Date(ms).toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false })) % 24
}

/** Texto do alerta interno (so' ao dono) quando a Fusion esta' ha' 60 min ou
 *  mais sem responder, entre 05h e 21h de Brasilia; uma vez por queda. */
export function decidirAlertaFusion(s: StatusFusion | null, agoraMs: number): string | null {
  if (!s || s.situacao !== 'erro' || !s.falhandoDesde || s.alertaEm) return null
  const h = horaBR(agoraMs)
  if (h < HORA_INICIO_ALERTA_BR || h >= HORA_FIM_ALERTA_BR) return null
  if (agoraMs - Date.parse(s.falhandoDesde) < ALERTA_FUSION_APOS_MIN * 60_000) return null
  return `KPI Rio Quality: a Fusion não responde desde ${hhmmBR(s.falhandoDesde)} (último erro às ${hhmmBR(s.ultimoErroEm ?? s.ultimaTentativa)}: ${s.ultimoErro ?? 'sem mensagem'}). `
    + 'O Ao vivo da RQ está parado no último dado; ver a ponte da Fusion no Mac ou subir o Relatório de Entregas.'
}

export type BannerFusion = { tipo: 'sem_resposta' | 'manual'; texto: string; acao: 'voltar_fusion' | null }

/** Banner do Ao vivo da RQ (dia de hoje). O dia subido a mao tem prioridade:
 *  nele a Fusion nao e' consultada. */
export function bannerFusion(s: StatusFusion | null, dia: { fonte: string | null; enviadoEm: string } | null): BannerFusion | null {
  if (dia?.fonte === 'manual') {
    return {
      tipo: 'manual', acao: 'voltar_fusion',
      texto: `Dia travado no envio manual de ${hhmmBR(dia.enviadoEm)}: a Fusion não é consultada hoje.`,
    }
  }
  if (s?.situacao === 'erro' && s.falhandoDesde) {
    return {
      tipo: 'sem_resposta', acao: null,
      texto: `Fusion sem responder desde ${hhmmBR(s.falhandoDesde)} (última tentativa às ${hhmmBR(s.ultimaTentativa)}). Os números podem estar parados; dá para subir o Relatório de Entregas.`,
    }
  }
  return null
}
