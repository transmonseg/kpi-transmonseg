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
  // Achado real 11-12/09 (auditoria com a Ana, dias 09 e 10/09): coordenada
  // pode existir e ainda assim estar a 20-130km do lugar certo (rua homonima
  // de outro municipio aceita sem validacao de cidade, ou centroide de
  // bairro). Quando false, a coordenada NAO sustenta conclusao negativa
  // ("nao foi ao cliente") nem atribuicao de entrega a outra placa -- ver
  // montarDetalheEntregas em agregacao.ts. Opcional: linha antiga/produtor
  // que nao passa nada continua valendo como confiavel (comportamento
  // anterior, nunca quebra chamador existente).
  geoConfiavel?: boolean
  /** Por que geoConfiavel e' false. Ausente quando a coordenada e' confiavel
   *  ou quando a suspeita veio de outra origem (fonte cnefe_bairro).
   *  Fix 12/09 (Finding 8): union estreita, nao `string` solto -- os dois
   *  literais comparados em agregacao.ts (`=== 'municipio_divergente'` /
   *  `=== 'bairro_divergente'`) ficavam sem checagem de tipo. Fonte da
   *  verdade e' `MotivoTerritorio` em MONITORAMENTO/src/lib/territorio.ts;
   *  repositorios nao se importam entre si, entao o literal e' duplicado
   *  aqui de proposito -- manter os dois em sincronia manualmente. */
  geoMotivo?: 'municipio_divergente' | 'bairro_divergente'
  /** Task 2 (plano 2026-09-30, item 4 -- Alto Grande 29/09): coordenada do
   *  cache sem `fonte` registrada (origem desconhecida). Ausente/false =
   *  fonte conhecida ou produtor que nao informa (comportamento anterior). */
  geoSemFonte?: boolean
  // So' preenchido pela coerencia de grupo (Rio Quality): outros pontos da
  // MESMA rua na zona, alem do escolhido -- pedido 06/09, ver visitas.ts.
  pontosAlternativos?: { lat: number; lng: number }[]
  /** So' Rio Quality, formatos com cidade (endereco SEM numero): pontos CNEFE
   *  da mesma rua no mesmo municipio -- corredor da rua, ver
   *  kpi-rioquality/corredor-rua.ts e visitas.ts. */
  pontosCorredorRua?: { lat: number; lng: number }[]
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
  /** Confirmada por parada entre 500m e 800m do ponto -- achado 05/09 (Rio
   *  Quality, romaneio sem numero) e achado 06/09 (Nutry Max, placa RQV5F67/
   *  ENCONTRO PINHEIRO RESTAURANTE, parada real a 501m -- 1m fora do raio
   *  normal). Sai marcada no relatorio, nunca como confirmacao normal. Ver
   *  kpi-rioquality/visitas.ts e montarVisitas (kpi-romaneio/visitas.ts). */
  viaRaioAmpliado?: boolean
  /** Confirmada por parada perto de OUTRO ponto da mesma rua (nao o que a
   *  coerencia escolheu) -- pedido do usuario 06/09: "se disser a rua, e o
   *  caminhao parou naquela rua, conta como entrega", rua comprida pode ter
   *  varios trechos no CNEFE e o caminhao parar longe do trecho escolhido.
   *  So' Rio Quality. Ver kpi-rioquality/visitas.ts. */
  viaOutroPontoDaRua?: boolean
  /** Corredor da rua (RQ, endereco sem numero, relatorio 01/10): parada
   *  PROPRIA >= 2 min a <= 200 m de qualquer ponto CNEFE da mesma rua/
   *  municipio. Horario e' o da parada (aproximado pro cliente). */
  viaCorredorDaRua?: boolean
}

export type StatusEntrega = 'confirmado_unitrac' | 'confirmado_gps' | 'pendente'

/** Task 5 (plano 24/09, requisito P0 da Ana: "expor origem, método e
 *  distância; não equiparar parada em rua semelhante a entrega") -- ORIGEM
 *  da confirmação (ou falta dela) de cada NF, além do `status`/`observacao`
 *  textual já existentes. Um valor por NF, na precedência abaixo (a mais
 *  forte primeiro; cada NF recebe a PRIMEIRA que se aplicar):
 *
 *  1. `sem_rastreador` -- placa sem nenhuma fonte de GPS no dia (ver
 *     `semRastreadorNoDia` em agregacao.ts) -- nunca teve como confirmar.
 *  2. `outra_placa` -- confirmada pela parada de OUTRO veículo da frota
 *     (`acharParadaDeOutraPlaca`), carga transferida.
 *  3. `alvo_feito_unitrac` -- confirmada só pelo alvo da Unitrac
 *     (`situacao===1`) SEM nenhuma Visita de GPS pra comparar distância.
 *  4. `parada_curta_compartilhada` -- confirmada, mas a mesma parada curta
 *     (≤3min) também "confirmaria" outro endereço distinto (item 3b) --
 *     ENTREGUE com ressalva.
 *  5. `vizinhanca` -- emprestou horário de OUTRO ponto do romaneio a
 *     <=800m (`Visita.viaVizinhanca`).
 *  6. `raio_ampliado` -- confirmada por dwell no PRÓPRIO endereço, só que
 *     no raio ampliado (500-800m, `Visita.viaRaioAmpliado`).
 *  7. `parada_no_cadastro_unitrac` -- a parada física real está mais perto
 *     do CADASTRO da Unitrac (`AlvoApi.pontoLat/pontoLng`) do que do nosso
 *     geocode.
 *  8. `parada_no_endereco` -- a parada física real está mais perto (ou só
 *     existe) o nosso próprio geocode.
 *  9. `sem_evidencia` -- nenhuma das anteriores: pendente sem nenhum sinal
 *     de GPS a favor (inclui a NF que PERDEU uma parada curta
 *     compartilhada pra outro endereço, `perdeuParadaCompartilhada`, e o
 *     caso "NÃO FOI AO CLIENTE" abaixo).
 *  10. `passagem_sem_parada` -- pendente sem visita própria, mas a placa
 *     esteve a <=500m do endereço sem registrar parada (rótulo "PASSOU NO
 *     ENDEREÇO MAS NÃO REGISTROU PARADA", Task 9 plano 24/09).
 *  11. `parada_proxima_fora_raio` -- pendente sem visita própria, placa
 *     entre 500m-2km do endereço (rótulo "PARADA PRÓXIMA (500m-2km) MAS
 *     FORA DO ENDEREÇO", Task 9 plano 24/09).
 *
 *  Nunca lido a partir de `Visita.distanciaMetrosDoPonto` (ver comentário
 *  de `acharCoordenadaDaParadaPropria` em agregacao.ts: esse campo vem
 *  SEMPRE 0 quando a Visita veio da ponte do monitoramento) -- a distância
 *  real vem de casar a janela [chegada, saída] da Visita contra as paradas
 *  cruas (`paradasPorOutraPlaca`), ou fica `null` quando não há como medir. */
export type EvidenciaNf =
  | 'parada_no_endereco'
  | 'parada_no_cadastro_unitrac'
  | 'raio_ampliado'
  | 'vizinhanca'
  | 'parada_curta_compartilhada'
  | 'outra_placa'
  | 'alvo_feito_unitrac'
  | 'sem_evidencia'
  | 'sem_rastreador'
  // 29/09 (pedido Ana/dono, so' modoPrecisao/Nutry Max): placa que ficou o dia
  // todo na base -- rotulo 'VEÍCULO NÃO SAIU DA BASE', fora da taxa.
  | 'nao_saiu_da_base'
  | 'passagem_sem_parada'
  | 'parada_proxima_fora_raio'
  // Task 2 (plano 2026-09-25, R2): confirmada pela parada Unitrac CRUA da
  // PRÓPRIA placa (`paradasUnitracCruasPropriaPlaca`), sem visita nem alvo
  // 'feito' -- generaliza `acharParadaUnitracParaFeito` (que so' roda pra
  // `confirmado_unitrac` sem visita) pra qualquer NF ainda nao confirmada.
  // So' Nutry Max (`confirmarPorParadaUnitracPropria`, agregacao.ts).
  | 'parada_unitrac_propria'
  // Task 2 (plano 2026-09-26, rodizio de carga inteira): carga com escala
  // divergente coberta (>=80%) por UM unico outro veiculo da frota -- a NF
  // e' confirmada pela parada forte desse veiculo executor (mesma regra de
  // confirmacao da R2 em modoPrecisao). Unica excecao a desativarOutraPlaca.
  // So' Nutry Max (`reconhecerRodizio`, agregacao.ts).
  | 'rota_outra_placa'
  // Parada proxima propria (122e390 + guardas 29/09, so' modoPrecisao): NF
  // 'PARADA PRÓXIMA (500m-2km)' confirmada por parada da PROPRIA placa >=3 min
  // a 500 m-2 km, isolada. Distinta de 'parada_no_endereco' de proposito: nao
  // e' entrega medida no endereco, e' inferencia por parada vizinha.
  | 'parada_proxima_propria'

/** Task 3 (plano 2026-09-26): nivel de confianca de cada NF, derivado do
 *  MESMO par status/observacao ja calculado em montarDetalheEntregas -- nunca
 *  uma regra nova, so' uma segunda leitura em texto do que ja existe. Ver
 *  `calcularConfianca` em agregacao.ts pra precedencia exata:
 *  - `CONFIRMADA`: `status !== 'pendente'` (ENTREGUE de verdade, incl.
 *    rodizio de carga inteira -- Task 2).
 *  - `SEM BASE`: pendente com observacao de SEM RASTREADOR, CARGA SEM PLACA
 *    NO ROMANEIO ou AGUARDANDO (rota em andamento) -- nao ha' base de dado
 *    nenhuma pra julgar esta NF ainda.
 *  - `REVISAR`: pendente com observacao contendo REVISAR/CONFERIR/PASSOU --
 *    qualquer rotulo que pede conferencia humana (inclui os "- REVISAR" do
 *    modoPrecisao, Task 1).
 *  - `NÃO CONFIRMADO`: pendente sem nenhum dos rotulos acima (inclui "NÃO
 *    FOI AO CLIENTE" e pendente sem observacao nenhuma). */
export type ConfiancaNf = 'CONFIRMADA' | 'REVISAR' | 'NÃO CONFIRMADO' | 'SEM BASE'

/** Resolucao manual por NF (Task 4, plano 24/09) -- camada humana em cima do
 *  status automatico, persistida em `kpi_nf_resolucao`. `entregue_outra_placa`
 *  e' o caminho pra transferencia de placa que a Task 3 nao conseguiu
 *  automatizar (ex. RQU5J45 -> TUS1B06, NF 215999): a operacao registra QUAL
 *  placa executou de fato via `placaExecutora`. Valores EXATOS do enum da
 *  migration (supabase/migrations/20260924000000_kpi_resolucao_nf.sql) --
 *  nao renomear sem migrar o banco. */
export type ResolucaoNf =
  | 'entregue'
  | 'entregue_tempo_conferido'
  | 'entregue_rastro_oscilante'
  | 'entregue_outra_placa'
  | 'nao_esteve_no_local'
  | 'desatualizado'

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
  // Renomeado pra "NF CONFIRMADAS" no XLSX (Task 9, plano 24/09) -- o nome
  // do campo em código não mudou (evita mexer em todo consumidor), só o
  // rótulo visível: o valor sempre foi contagem de NF confirmadas, nunca
  // de parada física, e isso confundia a operação ("KPI 3 x relatório 4").
  paradasReais: number
  // Task 9 (plano 24/09): paradas FÍSICAS da placa classificadas FORA_BASE
  // pela Unitrac (`UnitracParadaRow.classificacao`) -- complementa
  // `paradasReais`/NF CONFIRMADAS (que conta NOTAS, não paradas: uma
  // parada física pode confirmar várias NFs de uma vez, ex. condomínio
  // com vários clientes). `paradasGps` (parâmetro de `agregarPorCarga`) é
  // por PLACA/DIA inteiro, não por carga -- quando a mesma placa roda mais
  // de uma carga no dia, TODAS as cargas dela mostram a mesma contagem
  // (não há janela [saída, chegada] por carga disponível aqui pra
  // recortar; documentado também no cálculo, agregacao.ts).
  paradasForaBase: number
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
  // Task 5 (plano 24/09): origem da (não-)confirmação -- ver comentário
  // completo de EvidenciaNf acima.
  evidencia: EvidenciaNf
  // Task 5: distância real (metros, haversine) entre a parada física real
  // (nunca `Visita.distanciaMetrosDoPonto`, ver EvidenciaNf) e a coordenada
  // que a evidência usou pra decidir (geocode do endereço, cadastro da
  // Unitrac, ou a parada da outra placa) -- `null` quando não há como medir
  // (sem coordenada, sem parada física casada por horário, geocode não
  // confiável). Nunca inventado.
  distParadaM: number | null
  // Task 3 (plano 2026-09-26): frase em PT-BR gerada a partir de evidencia/
  // distParadaM/tempoParadaMin/observacao/placaExecutora -- resumo em
  // linguagem natural do mesmo veredito que `observacao`/`evidencia`/
  // `distParadaM` ja' expressam separadamente (nunca uma fonte de verdade
  // nova). Numeros arredondados (minutos inteiros, metros inteiros, km com
  // 1 casa acima de 1.000m). Ver `gerarMotivo` em agregacao.ts.
  motivo: string
  // Task 3 (plano 2026-09-26): ver comentario completo de ConfiancaNf acima.
  confianca: ConfiancaNf
  // Task 2 (plano 2026-09-26): placa que de fato executou a rota quando a NF
  // foi confirmada por rodizio de carga inteira (evidencia
  // 'rota_outra_placa'). Ausente/null em qualquer outro caso.
  placaExecutora?: string | null
  // Task 4 (plano 24/09): resolucao manual VIGENTE (mais recente) desta NF,
  // aplicada por cima do automatico via aplicarResolucoes (resolucoes.ts) --
  // NUNCA sobrescreve `status`/`observacao` acima, so' preenche estes campos
  // extra pro gerador desenhar as colunas novas ("RESOLUÇÃO OPERAÇÃO",
  // "RESPONSÁVEL") e a segunda taxa do resumo. `undefined`/ausente = NF sem
  // nenhuma resolucao manual registrada (comportamento identico ao de antes
  // da Task 4).
  resolucaoManual?: ResolucaoNf | null
  responsavelResolucao?: string | null
  placaExecutoraResolucao?: string | null
  documentoResolucao?: string | null
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
  // 'consulta_unitrac_falhou' e 'rq_*': so' Rio Quality (Tasks 1 e 4, plano
  // 2026-09-30) -- Custos x Entregas e frota, analogos do Escala x Romaneio.
  // 'motorista_multiplas_placas' e 'carga_multiregiao': alertas operacionais
  // Nutry Max (02/10) -- nao bloqueiam, so' informam na aba Avisos.
  motivo: 'sem_romaneio' | 'sem_escala' | 'nf_divergente' | 'consulta_posicoes_suspeita' | 'consulta_unitrac_falhou'
    | 'rq_sem_rota_custos' | 'rq_rota_sem_entregas' | 'rq_placa_sem_cv' | 'rq_sem_snapshot'
    | 'geocode_parcial' | 'motorista_multiplas_placas' | 'carga_multiregiao'
  /** So' em 'geocode_parcial' (incidente 01/10): enderecos sem resultado porque a
   *  busca por similaridade CNEFE estourou o timeout ou passou do teto da geracao. */
  enderecosParciais?: number
  /** So' em 'rq_sem_snapshot' (Rio Quality, dia fora das 48h): placas sem dado no snapshot de paradas. */
  placasSemSnapshot?: number
  /** So' em 'consulta_posicoes_suspeita' (trava 29/09, coletor fora do ar): placas detectadas sem sinal x placas da escala. */
  semSinal?: number
  totalPlacas?: number
  /** So' em 'nf_divergente' (Task 2 plano 2026-09-30): NF PLANEJADO da Escala x NFs do Romaneio da carga. */
  nfEscala?: number
  nfRomaneio?: number
  /** So' em 'motorista_multiplas_placas' (02/10): nome normalizado do motorista que aparece em 2+ placas. */
  motorista?: string
  /** So' em 'motorista_multiplas_placas' (02/10): lista de placas distintas onde o motorista aparece. */
  placas?: string[]
  /** So' em 'carga_multiregiao' (02/10): distancia maxima entre centróides das NFs da carga (km). */
  distanciaKm?: number
}

/** Texto do aviso da trava contra "sem sinal" em massa (coletor do
 *  monitoramento fora do ar) -- log e aba Avisos. Ver placasSemSinalComTrava. */
export function textoConsultaPosicoesSuspeita(semSinal: number, totalPlacas: number): string {
  return `Consulta de posições suspeita: ${semSinal} de ${totalPlacas} placas sem sinal — não concluído`
}

/** Rotulo exato (Nutry Max/modoPrecisao) de NF de placa que nao saiu da base o dia todo.
 *  Prefixo usado por gerador-xlsx.ts pra excluir da taxa (como SEM RASTREADOR). */
export const OBS_NAO_SAIU_DA_BASE = 'VEÍCULO NÃO SAIU DA BASE'

/** Bug real 01/10 (RQO1B27, Pao PAO-2): veiculo passou o dia parado fora de
 *  qualquer base e so' entrou na base as 17:42 -- a ponte devolveu saida
 *  null + chegada 17:42 e o xlsx mostrava SAIDA CD "EM ROTA" com CHEGADA CD
 *  preenchida. Sem saida observada, a entrada na base nao e' "volta da
 *  rota": chegada sem saida nunca e' EXIBIDA (xlsx/dashboard). O valor
 *  bruto continua em `chegadaCd` de proposito -- `calcularDiaEmAndamento`
 *  precisa saber que o veiculo ja' esta' na base (com null, as NFs da carga
 *  virariam AGUARDANDO e sairiam da taxa num relatorio do mesmo dia). */
export function chegadaCdExibivel(l: { saidaCd: string | null; chegadaCd: string | null }): string | null {
  return l.saidaCd ? l.chegadaCd : null
}
