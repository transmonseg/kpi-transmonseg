export type StatusRota = 'ENTREGUE' | 'ENTREGUE_GEO' | 'MUDOU_DE_ROTA' | 'SEM_RASTREADOR' | 'NAO_SAIU_DA_BASE' | 'NAO_FOI_AO_CLIENTE' | 'FORA_DE_BASE'

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
  /** Geo casou DENTRO do raio cadastrado (nosso limite de metros). Quando true, a
   * entrega entra no KPI do cliente sem precisar de revisão manual. Acima do raio
   * (zona 100–250m confirmada por rua/bairro) continua pedindo conferência. */
  geoConfiavel?: boolean
  /** A placa escalada apareceu no relatório e rodou OUTRA rota (foi a clientes
   * diferentes), não a escalada. Diferencia "mudou de rota" de "ficou na base". */
  placaFoiAlgumLugar?: boolean
  /** A placa saiu da base (tem alguma parada LOJA ou FORA_BASE no relatório).
   * Se a placa está no relatório (tem rastreador) mas isto é `false`, o caminhão
   * só ficou no CD → "NÃO SAIU DA BASE" (mais preciso que "não foi ao cliente"). */
  placaSaiuDaBase?: boolean
  /** Houve alteração de escala registrada para esta linha (troca/rota informada).
   * Quando true, uma entrega por outro veículo é ESPERADA, não "mudou de rota". */
  alteracaoInformada?: boolean
}

export interface ResultadoStatus {
  status: StatusRota
  revisar: boolean
  motivoRevisao: string | null
}

/** Deriva o status de uma rota a partir do que o motor já computa. A ordem importa. */
export function derivarStatus(d: DadosStatusRota): ResultadoStatus {
  if (!d.temGps) return { status: 'SEM_RASTREADOR', revisar: false, motivoRevisao: null }

  if (d.ficouNaBase) {
    // A placa apareceu no relatório e rodou OUTRA rota (foi a clientes), mas não a
    // escalada, e não houve alteração registrada → mudou de rota não informada.
    // Aparece no KPI marcada "MUDOU DE ROTA" (legendaSlot) e vai pra revisão.
    if (d.placaFoiAlgumLugar && !d.alteracaoInformada) {
      return { status: 'MUDOU_DE_ROTA', revisar: true, motivoRevisao: 'A placa rodou outra rota (não a escalada) e não há alteração registrada. Confira.' }
    }
    // A placa ESTÁ no relatório (tem rastreador) mas só tem parada na BASE — o
    // caminhão não saiu do CD. Mais preciso que "não foi ao cliente". (Sem rastreador
    // é só quando a placa nem aparece no relatório — tratado em !temGps acima.)
    if (d.placaSaiuDaBase === false) {
      return { status: 'NAO_SAIU_DA_BASE', revisar: false, motivoRevisao: null }
    }
    return { status: 'NAO_FOI_AO_CLIENTE', revisar: false, motivoRevisao: null }
  }

  // Sem NENHUMA parada de entrega: não pode ser "entregue", mesmo quando a rota não
  // caiu em ficouNaBase (status 'pendente' em vez de 'sem_entrega'). Classifica pelo
  // que a placa fez no relatório. Sem isso, o fallback final marcava ENTREGUE uma
  // rota vazia (falso positivo — ex: LKF só na base mas status pendente).
  if (d.paradas.length === 0) {
    if (d.placaFoiAlgumLugar && !d.alteracaoInformada) {
      return { status: 'MUDOU_DE_ROTA', revisar: true, motivoRevisao: 'A placa rodou outra rota (não a escalada) e não há alteração registrada. Confira.' }
    }
    if (d.placaSaiuDaBase === false) {
      return { status: 'NAO_SAIU_DA_BASE', revisar: false, motivoRevisao: null }
    }
    return { status: 'NAO_FOI_AO_CLIENTE', revisar: false, motivoRevisao: null }
  }

  // Match por geo/endereço: parada FORA_BASE casada à loja pela coordenada do cadastro.
  // Conta como entrega. Se caiu DENTRO do nosso limite de metros (raio cadastrado), é
  // alta confiança → entra no KPI sem revisão (pedido do Joaquim 2026-06-04). Acima do
  // raio (casou só por rua/bairro), continua pedindo conferência.
  if (d.viaGeo && d.paradas.some(p => p.classificacao === 'FORA_BASE' && p.loja_id)) {
    if (d.geoConfiavel) {
      return { status: 'ENTREGUE_GEO', revisar: false, motivoRevisao: null }
    }
    return { status: 'ENTREGUE_GEO', revisar: true, motivoRevisao: 'Localizado pelo endereço cadastrado (fora do raio), não pelo código do Unitrac. Confira.' }
  }

  // Troca de carro: a loja foi entregue (código + coordenada batem), mas por um
  // veículo diferente do escalado. Se NÃO houve alteração registrada, é uma mudança
  // de rota não informada → aparece no KPI como "MUDOU DE ROTA" e pede conferência.
  // Se a alteração foi informada, a troca é esperada → conta como entrega normal.
  if (d.viaTroca) {
    if (!d.alteracaoInformada) {
      const placa = d.placaReal ? ` Placa real: ${d.placaReal}.` : ''
      return { status: 'MUDOU_DE_ROTA', revisar: true, motivoRevisao: `Entregue por veículo diferente do escalado, sem alteração registrada.${placa} Confira a placa.` }
    }
    return { status: 'ENTREGUE', revisar: false, motivoRevisao: null }
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
  MUDOU_DE_ROTA: 'Mudou de rota',
  SEM_RASTREADOR: 'Sem rastreador',
  NAO_SAIU_DA_BASE: 'Não saiu da base',
  NAO_FOI_AO_CLIENTE: 'Não foi ao cliente',
  FORA_DE_BASE: 'Fora de base',
}
