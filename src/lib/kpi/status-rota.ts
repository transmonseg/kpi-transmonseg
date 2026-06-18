export type StatusRota = 'ENTREGUE' | 'ENTREGUE_GEO' | 'MUDOU_DE_ROTA' | 'SEM_RASTREADOR' | 'DESATUALIZADO' | 'NAO_SAIU_DA_BASE' | 'NAO_FOI_AO_CLIENTE' | 'FORA_DE_BASE'

/** Categoria específica do motivo de revisão — refina o "não foi" genérico. */
export type CategoriaRevisao = 'LOJA_SEM_CADASTRO' | 'LOJA_AMBIGUA' | 'ENTREGOU_FORA_ESCALA' | 'RELATORIO_PARCIAL'

/** Natureza do problema: separa "não é erro do sistema" de erro real.
 *  - dado: cadastro/loja faltando ou ambíguo (resolve cadastrando)
 *  - operacao: caminhão fez diferente da escala (resolve conferindo a rota)
 *  - relatorio: relatório gerado cedo/parcial
 *  - sistema: falha do próprio sistema (idealmente, nunca) */
export type NaturezaRevisao = 'dado' | 'operacao' | 'relatorio' | 'sistema'

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
  /** A placa entregou ao menos UMA das próprias linhas da escala (casou loja/geo).
   * Quando true, uma linha desta placa SEM parada é "não foi ao cliente" (rodou a
   * própria rota e pulou esta loja), NÃO "mudou de rota" (que é rodar outra rota
   * inteira). Caso real CXA-7B36 (entregou Grajaú 08, pulou Verdun 04) e KQR-2J11
   * (entregou 4, pulou Copacabana): saíam como "mudou de rota" — rótulo errado. */
  placaEntregouPropriaEscala?: boolean
  /** Placa da escala não está no Unitrac, mas existe uma placa a 1 caractere de
   * diferença que rodou a rota (provável typo no cadastro). Guarda essa placa. O
   * veículo TEM rastreador — não é "sem rastreador", é cadastro errado. Caso real
   * KWV-7E49 (escala) x KWV-7E89 (Unitrac). */
  placaDivergeUnitrac?: string | null
  /** Placa rastreada com rastro degenerado (um único ponto o dia todo / sem
   * deslocamento) — rastreador travado/sem sinal. Não dá pra concluir entrega.
   * Caso real LCE-4337 (1 ponto às 00:00 o dia inteiro). */
  rastreadorTravado?: boolean
  /** Loja escalada não tem codigo_unitrac/coordenada no cadastro → impossível
   * rastrear. Caso real: Jacarepaguá / Parque das Rosas (não existem no Unitrac). */
  lojaSemCadastroUnitrac?: boolean
  /** Existe outra loja da mesma rede praticamente no mesmo ponto (≤120m) e o
   * relatório veio sem código → geo não decide qual. Caso real: Méier
   * ("Prezunic Méier" + "Prezunic SPID Méier" a ~80m). */
  lojaAmbiguaComGemea?: { outra: string } | null
  /** A parada de entrega casada é uma loja com código que NÃO bate o nome da
   * escala → caminhão entregou em loja fora da escala. Caso real: Freguesia →
   * Vista Alegre. */
  entregouLojaForaEscala?: { lojaReal: string } | null
  /** O relatório do Unitrac foi emitido com o caminhão AINDA em rota: a placa saiu
   * da base perto do corte do relatório e não há chegada registrada (a entrega caiu
   * depois do horizonte do relatório). Honesto = "saiu da base, relatório parcial",
   * NÃO "não foi ao cliente". Caso real KOP-4978 09/06 (saiu 15:13, relatório cortou
   * 16:09, chegou 16:15). */
  relatorioParcial?: boolean
  /** Hora de saída de base (HH:MM) atribuída ao caso de relatório parcial — o fato
   * comprovado que o KPI deve mostrar mesmo sem entrega confirmada. */
  saidaBaseParcial?: string | null
  /** A placa não está no relatório Unitrac, mas a API diz que ela TEM rastreador e
   *  está sem transmitir (último GPS não é de hoje) → desatualizado, precisa
   *  manutenção. Não é "sem rastreador" (que é não ter equipamento). */
  placaDesatualizadaApi?: boolean
  /** A placa não está no relatório Unitrac, mas ESTÁ na frota da API e transmitiu
   *  hoje (tem rastreador funcionando) → não é "sem rastreador"; é "não foi ao
   *  cliente" (tem equipamento, só não apareceu no relatório). Regra do fundador. */
  placaTemRastreadorApi?: boolean
  /** Sugestão de troca de ALTA confiança (T18 segurou): a placa provável esteve nesta
   *  loja. Reclassifica status vermelho (não foi / sem rastreador / não saiu) para
   *  MUDOU_DE_ROTA (conferir). Ausente/null para sugestão BAIXA ou sem sugestão. */
  sugestaoTrocaAlta?: { placa: string; hora: string | null } | null
}

export interface ResultadoStatus {
  status: StatusRota
  revisar: boolean
  motivoRevisao: string | null
  /** Categoria específica do motivo (null quando é um caso genérico). */
  categoria: CategoriaRevisao | null
  /** Natureza do problema (só quando revisar=true). */
  natureza: NaturezaRevisao | null
}

type StatusBase = Pick<ResultadoStatus, 'status' | 'revisar' | 'motivoRevisao'>

/** Deriva o status de uma rota a partir do que o motor já computa. A ordem importa. */
function derivarStatusBase(d: DadosStatusRota): StatusBase {
  if (!d.temGps) {
    // A placa não está no relatório, mas a API confirma que TEM rastreador e está
    // sem transmitir hoje → desatualizado/manutenção (não é "sem rastreador").
    if (d.placaDesatualizadaApi) {
      return { status: 'DESATUALIZADO', revisar: true, motivoRevisao: 'Tem rastreador na frota do Unitrac, mas está sem transmitir hoje (último GPS de outro dia). Solicitar manutenção do rastreador.' }
    }
    // Placa não está no Unitrac, mas existe uma quase idêntica (1 caractere) que
    // rodou esta rota → cadastro errado no Unitrac, NÃO falta de rastreador. O
    // veículo tem rastreador; as entregas existem sob a placa divergente.
    if (d.placaDivergeUnitrac) {
      return {
        status: 'SEM_RASTREADOR',
        revisar: true,
        motivoRevisao: `Placa não encontrada no Unitrac, mas "${d.placaDivergeUnitrac}" (1 caractere de diferença) rodou esta rota. Provável placa errada no cadastro do Unitrac — o veículo TEM rastreador. Corrigir a placa no painel.`,
      }
    }
    // Tem rastreador na frota da API e transmitiu hoje, mas não apareceu no relatório
    // → tem equipamento funcionando, só não há dado no Unitrac. Não é "sem rastreador".
    if (d.placaTemRastreadorApi) {
      return { status: 'NAO_FOI_AO_CLIENTE', revisar: true, motivoRevisao: 'Tem rastreador na frota do Unitrac e transmitiu hoje, mas não apareceu no relatório. Conferir.' }
    }
    return { status: 'SEM_RASTREADOR', revisar: false, motivoRevisao: null }
  }

  // Rastreador travado/sem sinal (um único ponto o dia todo) e nenhuma entrega
  // casada: não dá pra concluir "mudou de rota" nem "entregue". Sinaliza o defeito.
  if (d.rastreadorTravado && d.paradas.length === 0) {
    return { status: 'NAO_FOI_AO_CLIENTE', revisar: true, motivoRevisao: 'Rastreador travado/sem sinal (um único ponto o dia todo, sem deslocamento). Não dá pra confirmar a entrega — conferir manualmente.' }
  }

  if (d.ficouNaBase) {
    // A placa apareceu no relatório e rodou OUTRA rota (foi a clientes), mas não a
    // escalada, e não houve alteração registrada → mudou de rota não informada.
    // Aparece no KPI marcada "MUDOU DE ROTA" (legendaSlot) e vai pra revisão.
    // EXCEÇÃO: se a placa entregou alguma das PRÓPRIAS lojas da escala, ela rodou a
    // própria rota e só pulou esta → "não foi ao cliente", não "mudou de rota".
    if (d.placaFoiAlgumLugar && !d.alteracaoInformada) {
      if (d.placaEntregouPropriaEscala) {
        return { status: 'NAO_FOI_AO_CLIENTE', revisar: true, motivoRevisao: 'A placa rodou a própria rota e entregou outras lojas da escala, mas não passou nesta. Confira.' }
      }
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
      // Mesma distinção: entregou alguma das próprias lojas → pulou esta ("não foi
      // ao cliente"); não entregou nenhuma → rodou outra rota ("mudou de rota").
      if (d.placaEntregouPropriaEscala) {
        return { status: 'NAO_FOI_AO_CLIENTE', revisar: true, motivoRevisao: 'A placa rodou a própria rota e entregou outras lojas da escala, mas não passou nesta. Confira.' }
      }
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

/** Natureza padrão por status, quando nenhuma categoria específica se aplica. */
const NATUREZA_DE_STATUS: Record<StatusRota, NaturezaRevisao> = {
  ENTREGUE: 'sistema', ENTREGUE_GEO: 'sistema',
  MUDOU_DE_ROTA: 'operacao', FORA_DE_BASE: 'operacao',
  NAO_SAIU_DA_BASE: 'operacao', NAO_FOI_AO_CLIENTE: 'operacao',
  SEM_RASTREADOR: 'dado', DESATUALIZADO: 'dado',
}

/**
 * Classifica o resultado base numa categoria + natureza, refinando o motivo.
 * Não inventa erro: só refina linhas que JÁ iriam pra revisão (dado faltando que
 * explica o "não foi") ou reclassifica entrega em loja errada como "mudou de rota".
 */
export function derivarStatus(d: DadosStatusRota): ResultadoStatus {
  const base = derivarStatusBase(d)
  const temEntrega = d.paradas.some(p => p.loja_id != null)

  // Sugestão de troca ALTA: o T18 segurou, mas um carro da rede com rota própria esteve
  // nesta loja. Em vez de vermelho ("não foi"/"sem rastreador"/"não saiu da base"), marca
  // "mudou de rota" (conferir, amarelo) com a placa provável no motivo. Espelha o caminho
  // de troca real não informada (viaTroca && !alteracaoInformada).
  if (d.sugestaoTrocaAlta &&
      (base.status === 'NAO_FOI_AO_CLIENTE' || base.status === 'SEM_RASTREADOR' || base.status === 'NAO_SAIU_DA_BASE')) {
    const h = d.sugestaoTrocaAlta.hora ? ` às ${d.sugestaoTrocaAlta.hora}` : ''
    return {
      status: 'MUDOU_DE_ROTA', revisar: true,
      motivoRevisao: `Provável troca: a placa ${d.sugestaoTrocaAlta.placa} esteve nesta loja${h}. Confirmar.`,
      categoria: null, natureza: 'operacao',
    }
  }

  // Entregou numa loja que não é a escalada → mudou de rota (com a loja real no motivo).
  if (d.entregouLojaForaEscala && (base.status === 'ENTREGUE' || base.status === 'ENTREGUE_GEO')) {
    return {
      status: 'MUDOU_DE_ROTA', revisar: true,
      motivoRevisao: `Entregou em loja fora da escala (${d.entregouLojaForaEscala.lojaReal}). Conferir a rota.`,
      categoria: 'ENTREGOU_FORA_ESCALA', natureza: 'operacao',
    }
  }
  // Relatório emitido com o caminhão ainda em rota: a placa saiu da base perto do
  // corte e a chegada caiu depois do horizonte do relatório. Não é "não foi" — é
  // parcial. Mantém o status base (não conta como entregue), mas refina o motivo e
  // pede conferência. O KPI mostra a saída de base (fato), não um "não foi" seco.
  if (!temEntrega && d.relatorioParcial) {
    const saiu = d.saidaBaseParcial ? ` (saiu da base ${d.saidaBaseParcial})` : ''
    return {
      status: base.status, revisar: true,
      motivoRevisao: `Relatório emitido antes da chegada${saiu} — o caminhão ainda estava em rota. Confirmar depois do próximo relatório.`,
      categoria: 'RELATORIO_PARCIAL', natureza: 'relatorio',
    }
  }
  // Linha sem entrega: dado faltando explica o "não foi" (não é erro do sistema).
  if (!temEntrega && d.lojaSemCadastroUnitrac) {
    return {
      status: base.status, revisar: true,
      motivoRevisao: 'Loja sem cadastro no Unitrac (código/coordenada) — impossível rastrear. Cadastrar a loja.',
      categoria: 'LOJA_SEM_CADASTRO', natureza: 'dado',
    }
  }
  if (!temEntrega && d.lojaAmbiguaComGemea) {
    return {
      status: base.status, revisar: true,
      motivoRevisao: `Duas lojas no mesmo ponto (${d.lojaAmbiguaComGemea.outra}) e o relatório veio sem código — confirmar qual recebeu.`,
      categoria: 'LOJA_AMBIGUA', natureza: 'dado',
    }
  }
  return {
    ...base,
    categoria: null,
    natureza: base.revisar ? NATUREZA_DE_STATUS[base.status] : null,
  }
}

/** Rótulo legível da categoria. */
export const CATEGORIA_LABEL: Record<CategoriaRevisao, string> = {
  LOJA_SEM_CADASTRO: 'Sem cadastro no Unitrac',
  LOJA_AMBIGUA: 'Loja ambígua (gêmea)',
  ENTREGOU_FORA_ESCALA: 'Entregou fora da escala',
  RELATORIO_PARCIAL: 'Relatório parcial',
}

/** Estilo do selo por natureza (emoji + cor) pra UI. */
export const NATUREZA_STYLE: Record<NaturezaRevisao, { label: string; emoji: string; cor: string }> = {
  dado: { label: 'Dado faltando', emoji: '🟣', cor: '#a855f7' },
  operacao: { label: 'Operação', emoji: '🔵', cor: '#3b82f6' },
  relatorio: { label: 'Relatório', emoji: '⚪', cor: '#9ca3af' },
  sistema: { label: 'Sistema', emoji: '🔴', cor: '#ef4444' },
}

/** Rótulo legível pra UI. */
export const STATUS_LABEL: Record<StatusRota, string> = {
  ENTREGUE: 'Entregue',
  ENTREGUE_GEO: 'Entregue (geo)',
  MUDOU_DE_ROTA: 'Mudou de rota',
  SEM_RASTREADOR: 'Sem rastreador',
  DESATUALIZADO: 'Desatualizado',
  NAO_SAIU_DA_BASE: 'Não saiu da base',
  NAO_FOI_AO_CLIENTE: 'Não foi ao cliente',
  FORA_DE_BASE: 'Fora de base',
}

// ── Níveis de certeza (3 baldes) ─────────────────────────────────────────────
// Agrupa os 7 status em 3 níveis pra operação "bater o olho": o que dá pra
// confiar, o que é pra conferir, e o que realmente não saiu. Fonte única usada
// pela tela E pelo XLSX, pra os dois nunca divergirem.
export type TierCerteza = 'confirmado' | 'conferir' | 'nao_entregou'

/** Tier base por status (antes de considerar revisar/categoria). */
export const TIER_DE_STATUS: Record<StatusRota, TierCerteza> = {
  ENTREGUE: 'confirmado',
  ENTREGUE_GEO: 'confirmado',
  MUDOU_DE_ROTA: 'conferir',
  FORA_DE_BASE: 'conferir',
  NAO_FOI_AO_CLIENTE: 'nao_entregou',
  NAO_SAIU_DA_BASE: 'nao_entregou',
  SEM_RASTREADOR: 'nao_entregou',
  DESATUALIZADO: 'conferir',
}

/** Tier EFETIVO: refina pelo `revisar`/`categoria`. Uma entrega geo fora do raio,
 *  um "não foi" que pede conferência, ou um relatório parcial não são certezas —
 *  caem em 'conferir'. Recebe o resultado de derivarStatus (ou um subset). */
export function tierEfetivo(r: Pick<ResultadoStatus, 'status' | 'revisar'> & { categoria?: CategoriaRevisao | null }): TierCerteza {
  if (r.categoria === 'RELATORIO_PARCIAL') return 'conferir'
  const base = TIER_DE_STATUS[r.status]
  // Geo fora do raio com revisar não é certeza pra cima.
  if (r.status === 'ENTREGUE_GEO' && r.revisar) return 'conferir'
  // Qualquer "não entregou" marcado para revisão é incerteza, não negativa
  // definitiva: cai em "conferir". Cobre placa divergente no cadastro Unitrac
  // (SEM_RASTREADOR+revisar, ex.: KWV-7E49 x KWV-7E89), NAO_FOI_AO_CLIENTE
  // revisável e loja sem cadastro/ambígua que caiu em NAO_SAIU_DA_BASE.
  if (base === 'nao_entregou' && r.revisar) return 'conferir'
  return base
}

/** Estilo de cada tier pra UI (cores do design system). */
export const TIER_STYLE: Record<TierCerteza, { label: string; emoji: string; bg: string; fg: string; dot: string }> = {
  confirmado:   { label: 'Confirmado',   emoji: '✅', bg: 'var(--color-success-soft)', fg: 'var(--color-success-soft-fg)', dot: 'var(--color-success)' },
  conferir:     { label: 'Conferir',     emoji: '🟡', bg: 'var(--color-warning-soft)', fg: 'var(--color-warning-soft-fg)', dot: 'var(--color-warning)' },
  nao_entregou: { label: 'Não entregou', emoji: '❌', bg: 'var(--color-danger-soft)',  fg: 'var(--color-danger-soft-fg)',  dot: 'var(--color-danger)' },
}

/** Explicação curta por status — usada na tela quando não há `motivoRevisao`
 *  específico (antes os no-show com revisar:false ficavam sem o porquê). */
export const MOTIVO_CURTO: Record<StatusRota, string> = {
  ENTREGUE: 'Entrega confirmada pelo código da loja no Unitrac.',
  ENTREGUE_GEO: 'Confirmada pela coordenada cadastrada da loja.',
  MUDOU_DE_ROTA: 'Rodou outra rota (não a escalada) — conferir.',
  FORA_DE_BASE: 'Parou fora de base; conferir se houve entrega.',
  NAO_FOI_AO_CLIENTE: 'Tem rastreador e saiu, mas não passou nesta loja.',
  NAO_SAIU_DA_BASE: 'O caminhão não saiu do CD neste relatório.',
  SEM_RASTREADOR: 'A placa não aparece no relatório do Unitrac.',
  DESATUALIZADO: 'Tem rastreador, mas sem transmitir hoje — precisa manutenção.',
}
