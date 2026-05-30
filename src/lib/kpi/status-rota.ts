export type StatusRota = 'ENTREGUE' | 'SEM_RASTREADOR' | 'NAO_FOI_AO_CLIENTE' | 'FORA_DE_BASE'

export interface DadosStatusRota {
  temGps: boolean
  ficouNaBase: boolean
  paradas: ReadonlyArray<{ classificacao: string; loja_id: string | null }>
}

export interface ResultadoStatus {
  status: StatusRota
  revisar: boolean
  motivoRevisao: string | null
}

/** Deriva o status de uma rota a partir do que o motor já computa. A ordem importa. */
export function derivarStatus(d: DadosStatusRota): ResultadoStatus {
  if (!d.temGps) return { status: 'SEM_RASTREADOR', revisar: false, motivoRevisao: null }
  if (d.ficouNaBase) return { status: 'NAO_FOI_AO_CLIENTE', revisar: false, motivoRevisao: null }

  const visitouLoja = d.paradas.some(p => p.classificacao === 'LOJA')
  const foraDeBase = d.paradas.some(p => p.classificacao === 'FORA_BASE' && !p.loja_id)
  if (foraDeBase && !visitouLoja) {
    return { status: 'FORA_DE_BASE', revisar: true, motivoRevisao: 'Parou fora de base; conferir se houve entrega.' }
  }
  return { status: 'ENTREGUE', revisar: false, motivoRevisao: null }
}

/** Rótulo legível pra UI. */
export const STATUS_LABEL: Record<StatusRota, string> = {
  ENTREGUE: 'Entregue',
  SEM_RASTREADOR: 'Sem rastreador',
  NAO_FOI_AO_CLIENTE: 'Não foi ao cliente',
  FORA_DE_BASE: 'Fora de base',
}
