/** Uma linha do Romaneio de Entrega -- um cliente dentro de uma carga/placa. */
export type LinhaRomaneio = {
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

/** Uma linha da Escala de Rota -- o planejado. */
export type LinhaEscala = {
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

/** LinhaRomaneio + coordenada, quando a geocodificacao deu certo. Ausencia
 *  de lat/lng NAO bloqueia o resto do pipeline -- ver secao "Tratamento de
 *  erro" da spec: status da linha ainda pode vir confirmado via Unitrac. */
export type LinhaGeocodificada = LinhaRomaneio & {
  lat: number | null
  lng: number | null
}

/** Uma visita confirmada por GPS dentro do perimetro PROPRIO (nunca o raio
 *  que a Unitrac cadastra para o alvo -- ver spec, secao "Descoberta que
 *  mudou o desenho duas vezes"). */
export type Visita = {
  nf: string
  chegada: string // ISO
  saida: string // ISO (fim_real do cluster, nao a chegada do proximo)
  distanciaMetrosDoPonto: number
  // Achado real 30/08: chegada/saida emprestadas de OUTRO ponto do mesmo
  // romaneio, confirmado a <=800m (mesmo caminhao, mesma parada real --
  // ver acharVisitasPorPonto em base-horarios/route.ts do monitoramento,
  // pendentes-500m-2km). true so quando a ponte confirmou por vizinhanca,
  // nunca por dwell no proprio endereco -- decisao do usuario 30/08:
  // marcar distinto no relatorio (observacao propria), nao tratar como
  // confirmacao direta igual as demais.
  viaVizinhanca?: boolean
  /** Confirmada por parada entre 500m e 800m do ponto -- so' Rio Quality, cujo
   *  romaneio nao tem NUMERO (coordenada e' de trecho de rua). Achado 05/09:
   *  entregas com geocode comprovadamente certo ficavam pendentes por 47m e
   *  107m alem do raio. Sai marcada no relatorio, nunca como confirmacao
   *  normal. Ver kpi-rioquality/visitas.ts. */
  viaRaioAmpliado?: boolean
}

export type StatusEntrega = 'confirmado_unitrac' | 'confirmado_gps' | 'pendente'

/** Uma linha de saida, cliente dentro de uma carga -- usada internamente
 *  antes da agregacao por carga. */
export type LinhaConfirmada = LinhaGeocodificada & {
  status: StatusEntrega
  horaConfirmacao: string | null // ISO -- feitoISO do alvo, ou a chegada da Visita
}

/** Uma carga inteira, pronta pro XLSX -- exatamente as colunas da amostra. */
export type LinhaKpiRomaneio = {
  carga: string
  placa: string
  destino: string
  motorista: string
  ajudante1: string | null
  ajudante2: string | null
  pesoKg: number | null
  clientesPlanejados: number | null
  nfPlanejado: number | null
  paradasReais: number
  kmPercorrido: number | null
  saidaCd: string | null // ISO
  chegadaCd: string | null // ISO
  tempoOperacaoMin: number | null
  tempoMedioParadaMin: number | null
  status: 'OK' | 'INCOMPLETO'
  // Pedido do usuario 25/08 ("nada mais no quesito informacoes?" -> nivel
  // Benassi): placa sem cv na Unitrac E sem entrada na ponte do
  // monitoramento (nunca respondeu por essa placa, nem com null) nunca teve
  // NENHUMA fonte de rastreamento no dia -- celula de horario vazia por
  // "SEM RASTREADOR" e' informacao diferente de vazia por "ainda em rota"
  // ou por bug real, ver gerador-xlsx.ts/motivoAusencia.
  temRastreador: boolean
}

/** Uma NF (entrega) dentro de uma carga -- linha da aba "Detalhamento" (pedido
 *  do usuario 24/08: alem do resumo por carga, ver como ficou CADA entrega).
 *  chegada/saida/tempoParadaMin so' vem preenchido quando ha Visita (GPS no
 *  nosso perimetro) -- confirmacao so' via Unitrac (sem GPS) nao da pra medir
 *  tempo de parada real, mesma filosofia de nunca inventar dado. */
export type LinhaDetalheEntrega = {
  carga: string
  placa: string
  motorista: string
  clienteCodigo: string
  nf: string
  clienteNome: string
  endereco: string
  // saidaCd/chegadaCd/tempoOperacaoMin (pedido do usuario 25/08): mesmos
  // valores da carga inteira (LinhaKpiRomaneio), repetidos em toda linha de
  // NF pra cada linha ficar auto-contida (mesmo raciocinio que ja trouxe
  // PLACA de volta pra esta aba, ver spec da coluna) -- nao sao dados por
  // entrega, sao dados da carga/placa emprestados aqui.
  saidaCd: string | null // ISO
  chegadaCd: string | null // ISO
  tempoOperacaoMin: number | null
  chegada: string | null // ISO -- chegada NA LOJA desta entrega
  saida: string | null // ISO -- saida DA LOJA desta entrega
  tempoParadaMin: number | null
  status: StatusEntrega
  // Mesmo raciocinio de LinhaKpiRomaneio.temRastreador, por NF -- herda o
  // valor da placa inteira (rastreamento e' por veiculo, nao por entrega).
  temRastreador: boolean
  // Pedido do usuario 25/08 (nivel Benassi): nota concreta quando o dado e'
  // suspeito -- troca de carro (outra placa da frota passou perto do ponto
  // no lugar da escalada) ou tempo em loja implausivel (>4h, ver
  // agregacao.ts). `null` = nada de suspeito, STATUS mostra o rotulo normal.
  observacao: string | null
}

/** Descasamento entre Escala e Romaneio -- carga que só aparece de um dos
 *  dois lados (ver spec, secao "Tratamento de erro/ambiguidade": "aviso
 *  agregado no topo do relatorio... nao bloqueia"). `sem_romaneio` = carga
 *  planejada na Escala mas sem nenhuma linha no Romaneio geocodificado
 *  (some do relatorio final sem isso -- o problema real que este aviso
 *  existe pra cobrir). `sem_escala` = carga que existe no Romaneio mas sem
 *  correspondencia na Escala -- ja aparece normalmente na aba principal
 *  (agregarPorCarga trata escala===null), listada aqui so' pra visibilidade
 *  agregada. */
export type AvisoDescasamento = {
  carga: string
  placa: string
  motivo: 'sem_romaneio' | 'sem_escala'
}
