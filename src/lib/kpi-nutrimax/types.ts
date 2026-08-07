/** Uma linha do Romaneio de Entrega — um cliente dentro de uma carga/placa. */
export type LinhaRomaneioNutrimax = {
  carga: string
  destino: string
  placa: string
  motorista: string
  ajudantes: string[]
  nf: string
  clienteCodigo: string
  clienteNome: string
  endereco: string
}

/** Uma linha da Escala de Rota — o planejado (qual placa vai pra qual destino, quantos NFs). */
export type LinhaEscalaNutrimax = {
  carga: string
  placaRaw: string
  placaNorm: string
  destino: string
  motorista: string
  ajudante1: string | null
  ajudante2: string | null
  pesoKg: number | null
  entPlanejado: number | null
  nfPlanejado: number | null
}

/** Aviso de cobertura ao cruzar a Escala (planejado) com o Romaneio (executado). */
export type AvisoCoberturaNutrimax =
  | { tipo: 'carga_ausente'; carga: string; destino: string; placa: string }
  | { tipo: 'placa_divergente'; carga: string; placaEscala: string; placaRomaneio: string }
  | { tipo: 'entregas_incompletas'; carga: string; planejado: number; recebido: number }

/** Uma linha pronta pra persistir em kpi_nutrimax_entradas — já cruzada com o Unitrac.
 *
 *  `status`: situacao=1 do Unitrac vira 'entregue'; situacao=98 vira
 *  'confirmado_indireto' — código sem documentação oficial do Unitrac, inferido
 *  a partir do padrão real dos dados (mesmo horário exato de conclusão em
 *  vários alvos de clientes diferentes pra mesma placa — indica confirmação
 *  automática por proximidade/lote, não um scan individual por cliente).
 *  Qualquer outro valor (incluindo 0, o mais comum) vira 'pendente'. */
export type EntradaNutrimax = {
  data: string // YYYY-MM-DD
  carga: string
  destino: string
  placa: string
  motorista: string | null
  nf: string
  cliente_codigo: string | null
  cliente_nome: string
  endereco: string | null
  status: 'entregue' | 'pendente' | 'confirmado_indireto'
  hora_realizado: string | null // ISO, null quando pendente
  /** A placa transmitiu algum dado pro Unitrac nesse dia (apareceu em pelo menos
   *  um alvo, de qualquer cliente) — false = sem rastreador ou offline o dia todo. */
  placa_rastreada: boolean
  /** A mesma placa aparece em mais de uma carga nesse dia (indício de troca de
   *  veículo no meio do dia ou erro de escala/romaneio). */
  placa_duplicada: boolean
}

/** Resumo de viagem de uma placa no dia, extraído do Relatório Parada e Serviço
 *  do Unitrac (PDF) — km real percorrido, não uma estimativa. */
export type ResumoViagemPlacaNutrimax = {
  placaNorm: string
  /** Soma da distância de todas as paradas do dia. null se o PDF não trouxe
   *  distância pra nenhuma parada dessa placa (não confundir com 0). */
  kmPercorrido: number | null
  qtdParadas: number
  inicioViagem: string | null // ISO
  fimViagem: string | null // ISO
}

/** KPI por carga/placa (mesmo espírito do KPI do Benassi, que é por loja — aqui
 *  não existe loja fixa, então a unidade é a carga/placa do dia), cruzando o
 *  planejado (Escala) com o realizado de verdade (Relatório Parada e Serviço
 *  do Unitrac — GPS real, não status de alvo). */
export type KpiViagemNutrimax = {
  carga: string
  placaRaw: string
  placaNorm: string
  destino: string
  motorista: string
  ajudante1: string | null
  ajudante2: string | null
  pesoKg: number | null
  entPlanejado: number | null
  nfPlanejado: number | null
  qtdParadasReal: number
  kmPercorrido: number | null
  inicioViagem: string | null // ISO
  fimViagem: string | null // ISO
  /** 'sem_rastreador' = placa da escala não apareceu no relatório do Unitrac;
   *  'incompleto' = apareceu, mas com menos paradas reais do que clientes
   *  planejados (ENT); 'ok' = bateu ou passou do planejado. */
  status: 'ok' | 'incompleto' | 'sem_rastreador'
}

/** Uma parada real do GPS (Relatório Parada e Serviço do Unitrac) casada com
 *  um cliente do romaneio pelo código da loja. */
export type ParadaConferidaNutrimax = {
  chegada: string // ISO
  saida: string // ISO
  distanciaKm: number | null
  localParada: string
  codigoLoja: string | null
  nomeLoja: string | null
}

/** Um cliente dentro da aba de uma placa, no relatório de conferência —
 *  com a confirmação física (GPS) além do documental (romaneio). */
export type ClienteConferidoNutrimax = {
  nf: string
  clienteNome: string
  endereco: string | null
  /** null = nenhuma parada GPS bateu o código de loja desse cliente. */
  parada: ParadaConferidaNutrimax | null
}

/** Uma linha do relatório "Romaneio Nutry" — uma carga/placa da escala, com o resultado
 *  da conferência contra o romaneio, os clientes encontrados, e o cruzamento com o
 *  GPS real (Relatório Parada e Serviço). */
export type RelatorioPlacaNutrimax = {
  carga: string
  placaRaw: string
  placaNorm: string
  destino: string
  motorista: string
  ajudante1: string | null
  ajudante2: string | null
  pesoKg: number | null
  nfPlanejado: number | null
  nfRecebido: number
  /** Clientes distintos planejados (ENT da escala) — diferente de NF: um cliente
   *  pode receber mais de uma nota fiscal na mesma carga. */
  entPlanejado: number | null
  /** Clientes distintos que de fato apareceram no romaneio pra essa carga. */
  entRecebido: number
  status: 'ok' | 'divergente' | 'ausente'
  clientes: ClienteConferidoNutrimax[]
  /** Soma da distância de todas as paradas do dia (GPS). null = placa não
   *  apareceu no Relatório Parada e Serviço (sem rastreador nesse dia). */
  kmPercorrido: number | null
  qtdParadasReal: number
  inicioViagem: string | null // ISO
  fimViagem: string | null // ISO
  /** Paradas do GPS classificadas como LOJA que não bateram nenhum cliente
   *  do romaneio dessa carga — evita esconder anomalias. */
  paradasSemCliente: ParadaConferidaNutrimax[]
}

/** Uma linha do KPI por loja (uma visita = uma linha, mesmo se teve mais de
 *  uma NF pro mesmo ponto naquele dia) — o que a rota /api/kpi/nutrimax/gerar
 *  produz agora, no mesmo espírito do KPI do Benassi (que também é por loja). */
export type LinhaKpiLojaNutrimax = {
  loja: string
  motorista: string
  placaNorm: string
  saidaBase: string | null // ISO
  chegadaLoja: string | null // ISO
  saidaLoja: string | null // ISO
  tempoNaLojaMin: number | null
  chegadaBase: string | null // ISO
  tempoOperacaoMin: number | null
  kmPercorrido: number | null
  /** 'confirmado' = a Unitrac marcou a entrega como feita (situacao=1) e deu
   *  hora; 'pendente' = a loja está nos alvos do dia mas ainda sem
   *  confirmação; 'sem_rastreador' = a placa da escala não apareceu em
   *  nenhum alvo (offline, sem sinal, ou fora da conta). */
  status: 'confirmado' | 'pendente' | 'sem_rastreador'
}
