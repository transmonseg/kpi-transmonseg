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
}

/** Uma NF (entrega) dentro de uma carga -- linha da aba "Detalhamento" (pedido
 *  do usuario 24/08: alem do resumo por carga, ver como ficou CADA entrega).
 *  chegada/saida/tempoParadaMin so' vem preenchido quando ha Visita (GPS no
 *  nosso perimetro) -- confirmacao so' via Unitrac (sem GPS) nao da pra medir
 *  tempo de parada real, mesma filosofia de nunca inventar dado. */
export type LinhaDetalheEntrega = {
  carga: string
  placa: string
  nf: string
  clienteNome: string
  endereco: string
  chegada: string | null // ISO
  saida: string | null // ISO
  tempoParadaMin: number | null
  status: StatusEntrega
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
