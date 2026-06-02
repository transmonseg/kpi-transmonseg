export type StatusRota = 'ENTREGUE' | 'ENTREGUE_GEO' | 'SEM_RASTREADOR' | 'NAO_FOI_AO_CLIENTE' | 'FORA_DE_BASE'

export interface DadosStatusRota {
  temGps: boolean
  ficouNaBase: boolean
  paradas: ReadonlyArray<{ classificacao: string; loja_id: string | null }>
  /** Rota cujo match veio do geo/endereço (FORA_BASE casado pela coordenada do cadastro). */
  viaGeo?: boolean
  /** Rota recuperada por troca de carro: loja entregue por placa diferente da escalada
   * (código + coordenada batem, mas o veículo é outro). */
  viaTroca?: boolean
  /** Placa que realmente entregou, quando viaTroca. Usada no motivo da revisão. */
  placaReal?: string | null
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

  // Match por geo/endereço: parada FORA_BASE casada à loja pela coordenada do cadastro.
  // Conta como entrega, mas sempre pede conferência (a coordenada bate, mas o Unitrac
  // não confirmou por código).
  if (d.viaGeo && d.paradas.some(p => p.classificacao === 'FORA_BASE' && p.loja_id)) {
    return { status: 'ENTREGUE_GEO', revisar: true, motivoRevisao: 'Localizado pelo endereço cadastrado, não pelo código do Unitrac. Confira.' }
  }

  // Troca de carro: a loja foi entregue (código + coordenada batem), mas por um
  // veículo diferente do escalado. Conta como entrega e sempre pede conferência
  // da placa — usa o mesmo tratamento visual do geo (cinza/revisão).
  if (d.viaTroca) {
    const placa = d.placaReal ? ` Placa real: ${d.placaReal}.` : ''
    return { status: 'ENTREGUE_GEO', revisar: true, motivoRevisao: `Entregue por veículo diferente do escalado (troca de carro).${placa} Confira a placa.` }
  }

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
  ENTREGUE_GEO: 'Entregue (geo)',
  SEM_RASTREADOR: 'Sem rastreador',
  NAO_FOI_AO_CLIENTE: 'Não foi ao cliente',
  FORA_DE_BASE: 'Fora de base',
}
