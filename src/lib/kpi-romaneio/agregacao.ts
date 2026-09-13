import type { AlvoApi } from '@/lib/unitrac-api'
// UnitracParadaRow vem de matcher.ts, não de unitrac-api -- mesma ressalva
// de unitrac.ts (Task 6).
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import type { LinhaEscala, LinhaGeocodificada, LinhaKpiRomaneio, LinhaDetalheEntrega, StatusEntrega, Visita } from './types'
import { haversine } from '@/lib/utils/geo'
import { RAIO_ENTREGA_METROS } from './constants'
import { acessoSomentePorBarco } from './acesso-restrito'

function minutosEntre(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000)
}

// Limiar de "tempo em loja implausível" (pedido do usuário 25/08, nível
// Benassi -- mesmo espírito do ANOM-08 dela, que usa >4h). Não é regra de
// conformidade, é sinal de dado suspeito pra conferir antes do relatório
// sair errado (ex: caminhão ficou de fato parado, ou o cluster juntou duas
// visitas em uma só).
const LIMITE_TEMPO_LOJA_MIN = 240

// Achado real 03/09: placa com 0km percorrido no dia inteiro (2622
// leituras na MESMA coordenada) tinha 29 entregas pendentes -- nenhuma
// tinha chance de confirmar, o caminhao nunca saiu (ou o rastreador
// travou). 2km de folga cobre deriva de GPS parado (nunca visto passar
// de algumas dezenas de metros mesmo em 24h) sem arriscar marcar rota
// curta de verdade como "sem movimento".
const LIMITE_KM_SEM_MOVIMENTO = 2

/** Acha, pra uma NF sem confirmação nenhuma pela placa escalada, se OUTRA
 *  placa da frota passou perto do mesmo ponto no dia -- sinal de troca de
 *  carro na hora da entrega (pedido do usuário 25/08, nível Benassi --
 *  mesmo espírito de sugestao-troca.ts dela). Usa o mesmo raio de
 *  confirmação por perímetro próprio (RAIO_ENTREGA_METROS), nunca o raio
 *  que a Unitrac cadastra pro alvo. */
// Achado real 05/09 (diagnostico do KPI Nutry Max de 03/09, cada pendente
// cruzado com o GPS bruto do dia): dos 261 pendentes COM coordenada, 98
// tinham OUTRA placa da frota PARADA a <= 500m do ponto -- carga transferida
// entre caminhoes. Caso mais claro: a placa TTJ9I18 tinha 19 pendentes,
// todos em Itaperuna, e nunca chegou a menos de 55km de la; quem rodou
// Itaperuna foi a RQU-2G47 (chegou a 81m dos pontos). A entrega FOI FEITA --
// marcar pendente e' errado. Devolve a parada junto pra herdar o horario.
// Distancia do ponto ate a parada mais proxima DA PROPRIA PLACA no dia.
// null quando nao da' pra medir (ponto sem coordenada, ou placa sem nenhuma
// parada fora de base). Base a parte: parar na garagem nao diz nada sobre a
// entrega.
function distanciaAteParadaPropria(
  linha: LinhaGeocodificada,
  placaNorm: string,
  paradasPorPlaca: Map<string, UnitracParadaRow[]>,
): number | null {
  if (linha.lat == null || linha.lng == null) return null
  let menor: number | null = null
  for (const p of paradasPorPlaca.get(placaNorm) ?? []) {
    if (p.classificacao !== 'FORA_BASE' || p.lat == null || p.lng == null) continue
    const d = haversine(p.lat, p.lng, linha.lat, linha.lng)
    if (menor === null || d < menor) menor = d
  }
  return menor
}

// Pedido do usuario 05/09 ("se a porra foi feita ... umas nomeclaturas
// melhores"): "PENDENTE" soa como "o motorista nao entregou", quando na
// maioria das vezes e' o nosso lado que nao confirmou. Estes rotulos dizem o
// que o GPS mostra. Entre os dois limites nao ha rotulo -- nao da' pra
// afirmar nada.
const RAIO_PASSOU_SEM_PARAR_M = 500
const RAIO_NAO_FOI_AO_CLIENTE_M = 2_000

function acharParadaDeOutraPlaca(
  linha: LinhaGeocodificada,
  placaEsperada: string,
  paradasPorOutraPlaca: Map<string, UnitracParadaRow[]>,
): { placa: string; parada: UnitracParadaRow } | null {
  if (linha.lat == null || linha.lng == null) return null
  let melhor: { placa: string; parada: UnitracParadaRow; dist: number } | null = null
  for (const [outraPlaca, paradas] of paradasPorOutraPlaca) {
    if (outraPlaca === placaEsperada) continue
    for (const p of paradas) {
      if (p.classificacao !== 'FORA_BASE' || p.lat == null || p.lng == null) continue
      const dist = haversine(p.lat, p.lng, linha.lat as number, linha.lng as number)
      if (dist > RAIO_ENTREGA_METROS) continue
      if (!melhor || dist < melhor.dist) melhor = { placa: outraPlaca, parada: p, dist }
    }
  }
  return melhor ? { placa: melhor.placa, parada: melhor.parada } : null
}

/** Uma carga = todas as linhas do romaneio com o mesmo `carga`+`placa`.
 *  Cruza com a Escala (planejado) e decide status por NF: confirmado se
 *  alvo.situacao===1 (Unitrac) OU se ha Visita (GPS no nosso perimetro) --
 *  nunca por coordenada do alvo (ver spec). */
export function agregarPorCarga(
  carga: string,
  placaNorm: string,
  linhasRomaneio: LinhaGeocodificada[],
  escala: LinhaEscala | null,
  alvos: AlvoApi[],
  visitasPorNf: Map<string, Visita>,
  paradasGps: UnitracParadaRow[],
  kmPercorridoFallback: number | null,
  // Achado real 25/08: fonte PREFERIDA de saida/chegada/km da base, via
  // cruzamento de geofence + soma ponto-a-ponto em posicao continua real
  // (monitoramento, ver base-horarios.ts) -- sem heuristica de
  // cluster/duracao minima pro horario, sem pular trecho entre paradas
  // pro km (ao contrario de eventosBase/kmPercorridoFallback abaixo, que
  // vem do feed de paradas da Unitrac). `undefined` = a ponte nao tinha
  // dado pra essa placa (offline, placa nao rastreada la, erro de rede)
  // -- cai pro calculo antigo, nunca quebra o pipeline. Cada campo
  // (saida/chegada/km) e' fail-open INDEPENDENTEMENTE: a ponte pode saber
  // a saida mas nao a chegada (dia em andamento) -- nesse caso so' a
  // chegada cai pro fallback antigo.
  horarioBaseBridge?: { saidaBase: string | null; chegadaBase: string | null; kmPercorrido: number | null },
  // Pedido do usuário 25/08 (nível Benassi): placa sem NENHUMA fonte de
  // rastreamento no dia (sem cv na Unitrac E sem entrada na ponte do
  // monitoramento) -- default true por conveniência dos testes existentes
  // (a maioria assume veículo rastreado); route.ts/script sempre passam o
  // valor real calculado.
  temRastreador: boolean = true,
): LinhaKpiRomaneio {
  const alvoPorNf = new Map(alvos.filter(a => a.documento).map(a => [a.documento as string, a]))

  let confirmadas = 0
  for (const linha of linhasRomaneio) {
    const alvo = alvoPorNf.get(linha.nf)
    const confirmadoUnitrac = alvo?.situacao === 1
    const confirmadoGps = visitasPorNf.has(linha.nf)
    if (confirmadoUnitrac || confirmadoGps) confirmadas++
  }

  const eventosBase = paradasGps.filter(p => p.classificacao === 'BASE')
  // Achado real 24/08 (dado real da Nutry Max): placa com só UMA permanência
  // na base no dia (ex. parada de meio-dia pra recarregar) fazia
  // primeiraBase===ultimaBase===a MESMA permanência -- saidaCd virava o FIM
  // dessa parada e chegadaCd o INÍCIO da mesma parada, invertendo a ordem
  // (chegada antes da saída) e gerando TEMPO OPERAÇÃO negativo. Com uma só
  // permanência não dá pra saber se é a saída da manhã, a volta da noite, ou
  // uma parada no meio do dia -- ambíguo demais pra usar. Exige pelo menos 2
  // permanências distintas na base pra computar os dois campos; com 0 ou 1,
  // os dois ficam vazios (mesma filosofia de "placa sem nenhum evento BASE"
  // já documentada abaixo -- nunca inventa horário, nunca inverte ordem).
  const primeiraBase = eventosBase.length >= 2 ? eventosBase[0] : null
  const ultimaBase = eventosBase.length >= 2 ? eventosBase[eventosBase.length - 1] : null
  // saida CD = fim da PRIMEIRA permanencia na base (quando o caminhao sai
  // pra rua); chegada CD = inicio da ULTIMA permanencia na base (quando
  // volta no fim do dia). Placa que nunca aparece em BASE (ou só aparece
  // uma vez) fica com os dois vazios -- nao inventa horario.
  const saidaCdFallback = primeiraBase ? (primeiraBase.fim_real ?? primeiraBase.saida) : null
  const chegadaCdFallback = ultimaBase ? ultimaBase.chegada : null
  // horarioBaseBridge presente (mesmo com campo null) = a ponte respondeu
  // por essa placa -- CONFIA no null dela em vez de cair pro calculo
  // antigo, porque um null da ponte e' "nunca observado dentro da base
  // e/ou ainda nao voltou", que e' MAIS confiavel que a heuristica de
  // cluster abaixo (e' exatamente o tipo de guess errado que a ponte foi
  // criada pra evitar). Só cai pro fallback quando a ponte nao respondeu
  // NADA pra essa placa (undefined -- offline, placa nao rastreada la).
  const saidaCd = horarioBaseBridge ? horarioBaseBridge.saidaBase : saidaCdFallback
  const chegadaCd = horarioBaseBridge ? horarioBaseBridge.chegadaBase : chegadaCdFallback
  // Mesmo raciocinio do saida/chegada acima: confia no km da ponte mesmo
  // quando null (menos de 2 posicoes no dia -- sinal real de "sem dado",
  // nao motivo pra cair pro calculo antigo que so soma reta entre paradas
  // e subestima o trajeto real em ~45%, ver comentario de
  // calcularKmContinuo do lado do monitoramento).
  const kmPercorrido = horarioBaseBridge ? horarioBaseBridge.kmPercorrido : kmPercorridoFallback

  // Achado 10/09 (pedido do usuario "so com romaneio da pra fazer o kpi?"):
  // Escala virou OPCIONAL -- ver comentario completo no fallback de
  // ajudante1/ajudante2/clientesPlanejados abaixo. nfPlanejado especificamente
  // decide o status OK/INCOMPLETO (linha seguinte), entao sem fallback pro
  // tamanho do proprio romaneio, toda carga sem Escala virava falsamente
  // "OK" mesmo faltando confirmar entrega -- pior que so' perder uma coluna.
  const nfPlanejado = escala?.nfPlanejado ?? (linhasRomaneio.length || null)
  const status: 'OK' | 'INCOMPLETO' = nfPlanejado != null && confirmadas < nfPlanejado ? 'INCOMPLETO' : 'OK'

  // Tempo médio por entrega (pedido do usuário 24/08): média da duração real
  // de cada parada confirmada por GPS (visita.saida - visita.chegada) dentre
  // as NF desta carga. So conta NF com Visita de verdade -- confirmação só
  // via Unitrac (sem GPS) não tem duração de parada pra medir. Sem nenhuma
  // Visita nesta carga, fica null (nao inventa media de zero amostras).
  const duracoesParada = linhasRomaneio
    .map(l => visitasPorNf.get(l.nf))
    .filter((v): v is Visita => v != null)
    .map(v => minutosEntre(v.chegada, v.saida))
  const tempoMedioParadaMin = duracoesParada.length > 0
    ? Math.round(duracoesParada.reduce((s, m) => s + m, 0) / duracoesParada.length)
    : null

  return {
    carga,
    placa: placaNorm,
    destino: escala?.destino ?? linhasRomaneio[0]?.destino ?? '',
    motorista: escala?.motorista ?? linhasRomaneio[0]?.motorista ?? '',
    // Achado 10/09: Escala virou opcional (o Romaneio ja' repete
    // motorista/destino/ajudantes por linha -- so' peso e' exclusivo da
    // Escala, sem fonte nenhuma pra recuperar sem ela, ver conversa com o
    // usuario). ajudante1/ajudante2 (Escala separa em 2 campos) cai pro
    // array `ajudantes` do proprio Romaneio quando a Escala nao veio.
    ajudante1: escala?.ajudante1 ?? linhasRomaneio[0]?.ajudantes[0] ?? null,
    ajudante2: escala?.ajudante2 ?? linhasRomaneio[0]?.ajudantes[1] ?? null,
    // pesoKg NAO tem fallback de proposito -- nao existe em nenhum outro
    // documento nem na Unitrac (conferido: alvos/posicoes/frota, nenhum
    // endpoint traz peso, e' so' rastreamento GPS/telemetria, nao WMS/ERP).
    // Sem Escala, fica null mesmo -- nunca inventa peso.
    pesoKg: escala?.pesoKg ?? null,
    // clientesPlanejados sem Escala cai pra contagem de clientes UNICOS do
    // proprio Romaneio desta carga -- mesma fonte de "planejado" que a
    // Escala usa (as duas vem do mesmo processo de planejamento do CD, a
    // Escala nunca teve um numero "mais realista" que o Romaneio pra isso).
    clientesPlanejados: escala?.entPlanejado ?? new Set(linhasRomaneio.map(l => l.clienteCodigo)).size,
    nfPlanejado,
    paradasReais: confirmadas,
    kmPercorrido,
    saidaCd,
    chegadaCd,
    tempoOperacaoMin: saidaCd && chegadaCd ? minutosEntre(saidaCd, chegadaCd) : null,
    tempoMedioParadaMin,
    status,
    temRastreador,
  }
}

/** Uma linha por NF (entrega) dentro da carga -- aba "Detalhamento" (pedido
 *  do usuário 24/08: além do resumo por carga, mostrar como ficou CADA
 *  entrega). Mesmo critério de confirmação de agregarPorCarga (alvo Unitrac
 *  OU Visita GPS), mas aqui por linha, não agregado. */
/** saidaCd/chegadaCd/tempoOperacaoMin/motorista vem da carga inteira (mesma
 *  LinhaKpiRomaneio ja calculada por agregarPorCarga pra esta carga+placa) --
 *  repetidos em toda linha de NF, pedido do usuario 25/08 (ver comentario de
 *  LinhaDetalheEntrega em types.ts). */
export function montarDetalheEntregas(
  carga: string,
  placaNorm: string,
  linhasRomaneio: LinhaGeocodificada[],
  alvos: AlvoApi[],
  visitasPorNf: Map<string, Visita>,
  resumoCarga: { motorista: string; saidaCd: string | null; chegadaCd: string | null; tempoOperacaoMin: number | null },
  // Mesmo raciocinio/default de agregarPorCarga acima.
  temRastreador: boolean = true,
  // Paradas GPS de TODAS as placas da frota no dia (a própria incluída --
  // acharPlacaSuspeita já exclui `placaNorm` internamente), pra detectar
  // troca de carro (pedido do usuário 25/08). Default vazio = nenhuma
  // detecção (comportamento antigo, testes existentes não são afetados).
  paradasPorOutraPlaca: Map<string, UnitracParadaRow[]> = new Map(),
  // Achado real 03/09 (investigação "acabar com os pendentes"): placa
  // TTL-5J17 tinha 29 pendentes no mesmo dia -- rastro de GPS mostrou
  // 2622 leituras na MESMA coordenada exata, 0km percorridos o dia
  // inteiro. Rastreador travado ou o veículo nunca saiu -- nenhuma
  // confirmação de presença é fisicamente possível nesse caso, então
  // tratar como "pendente comum" (que sugere revisar geocode/raio) é
  // enganoso. kmPercorrido já vem calculado (mesma fonte de
  // agregarPorCarga, ponte pro monitoramento) -- default null preserva
  // o comportamento antigo pra quem não passar nada.
  kmPercorrido: number | null = null,
  // Achado real 10/09 (analise pedida pelo usuario sobre o KPI gerado no
  // meio do dia): com o relatorio de HOJE gerado antes de todas as rotas
  // acabarem, entrega que o caminhao simplesmente ainda nao chegou (rota em
  // andamento, `resumoCarga.chegadaCd` ainda null) caia nos MESMOS ramos de
  // "pendente" que uma entrega genuinamente perdida (NAO FOI AO CLIENTE, SEM
  // CONFIRMACAO, etc) -- inflando artificialmente a taxa de falha do dia
  // enquanto ele ainda esta rolando. `diaEmAndamento` (true so' quando o
  // relatorio e' do dia de HOJE e essa rota especifica ainda nao retornou
  // pra base) substitui qualquer observacao negativa por um status neutro
  // de espera -- nunca declara falha antes do dia realmente terminar pra
  // aquele veiculo. Default false preserva o comportamento antigo (relatorio
  // de dia passado, ou dia de hoje mas rota ja' finalizada) pra quem nao
  // passar nada.
  diaEmAndamento: boolean = false,
): LinhaDetalheEntrega[] {
  const alvoPorNf = new Map(alvos.filter(a => a.documento).map(a => [a.documento as string, a]))

  return linhasRomaneio.map((linha): LinhaDetalheEntrega => {
    const alvo = alvoPorNf.get(linha.nf)
    const visita = visitasPorNf.get(linha.nf)
    const confirmadoUnitrac = alvo?.situacao === 1
    const confirmadoGps = visita != null
    // Achado real 08/09 (auditoria completa pedida pelo usuario): placa
    // TTM2G01 passou o DIA INTEIRO em paradas classificadas BASE (nunca
    // registrou nenhuma FORA_BASE) mas o km acumulado (2,44km, deriva de
    // GPS parado ao longo de ~13h) ficou por pouco ACIMA de
    // LIMITE_KM_SEM_MOVIMENTO -- so' km e' fragil demais pra esse caso
    // (deriva pode superar 2km num dia inteiro parado, mesmo sem o
    // caminhao nunca ter saido). "Nunca saiu da base" (toda parada
    // classificada BASE, nenhuma FORA_BASE) e' evidencia direta e mais
    // forte que km: se o caminhao nunca deixou a base, fisicamente nao fez
    // nenhuma entrega, e as 2 NFs dele foram erroneamente atribuidas via
    // "carga transferida" a 2 OUTRAS placas so' porque semMovimento nao
    // disparou.
    const paradasProprias = paradasPorOutraPlaca.get(placaNorm) ?? []
    const nuncaSaiuDaBase = paradasProprias.length > 0 && paradasProprias.every(p => p.classificacao === 'BASE')
    const semMovimento = (kmPercorrido != null && kmPercorrido < LIMITE_KM_SEM_MOVIMENTO) || nuncaSaiuDaBase
    // Achado real 06/09 (grupo KPI AJUSTES, placa 5F67): motorista confirmou
    // que NAO houve troca de carga com 4D17/9B98 -- "o fato de passar perto
    // o sistema ta identificando [como troca]". acharParadaDeOutraPlaca
    // disparava pra QUALQUER outra placa a <=500m, sem checar se a PROPRIA
    // placa tambem estava plausivelmente por perto (rota urbana densa, varios
    // caminhoes da mesma frota atendendo lojas vizinhas -- coincidencia, nao
    // troca). O caso real que motivou essa logica (05/09, TTJ9I18) tinha a
    // propria placa a 55km de distancia -- so' faz sentido atribuir a outra
    // placa quando a PROPRIA genuinamente nunca chegou perto (mesmo teto de
    // "NAO FOI AO CLIENTE" abaixo, 2km), nunca so' por nao ter confirmado.
    // Achado real 11-12/09 (auditoria com a Ana): coordenada nao confiavel
    // (rua homonima de outro municipio aceita sem validacao de cidade, ou
    // centroide de bairro -- ja vimos 22km, 27km, 131km de erro) nao pode
    // sustentar NENHUMA conclusao por distancia. Zerar distPropria aqui
    // desliga de uma vez: carga transferida, "NAO FOI AO CLIENTE" e
    // "PASSOU NO ENDERECO" -- os tres saem de distPropria. O que sobra e'
    // confirmacao POSITIVA (alvo da Unitrac, ou parada real da propria
    // placa dentro do raio), que continua valendo: se o caminhao parou
    // mesmo naquela coordenada, e' evidencia a favor, nao contra.
    const geoConfiavel = linha.geoConfiavel !== false
    const distPropria = confirmadoUnitrac || confirmadoGps || semMovimento || !geoConfiavel
      ? null
      : distanciaAteParadaPropria(linha, placaNorm, paradasPorOutraPlaca)
    const propriaPlacaPlausivelmentePerto = distPropria != null && distPropria <= RAIO_NAO_FOI_AO_CLIENTE_M
    // Carga transferida: so' quando a PROPRIA placa nao confirmou. Rastreador
    // travado (sem movimento) tem outra explicacao e nao vira "transferida".
    const porOutraPlaca = confirmadoUnitrac || confirmadoGps || semMovimento || propriaPlacaPlausivelmentePerto || !geoConfiavel
      ? null
      : acharParadaDeOutraPlaca(linha, placaNorm, paradasPorOutraPlaca)

    const status: StatusEntrega = confirmadoUnitrac
      ? 'confirmado_unitrac'
      : confirmadoGps || porOutraPlaca
        ? 'confirmado_gps'
        : 'pendente'
    const chegada = visita?.chegada ?? porOutraPlaca?.parada.chegada ?? null
    const saida = visita?.saida
      ?? porOutraPlaca?.parada.fim_real ?? porOutraPlaca?.parada.saida ?? porOutraPlaca?.parada.chegada
      ?? null
    const tempoParadaMin = chegada && saida ? minutosEntre(chegada, saida) : null

    let observacao: string | null = null
    if (status === 'pendente' && semMovimento) {
      observacao = 'VEÍCULO SEM MOVIMENTO NO DIA - CONFERIR RASTREADOR OU SE SAIU PRA RUA'
    }
    if (observacao == null && porOutraPlaca) {
      observacao = `ENTREGUE POR OUTRA PLACA (${porOutraPlaca.placa}) - CARGA TRANSFERIDA`
    }
    if (observacao == null && tempoParadaMin != null && tempoParadaMin > LIMITE_TEMPO_LOJA_MIN) {
      observacao = 'TEMPO EM LOJA ACIMA DE 4H - CONFERIR'
    }
    // Achado real 30/08 (bucket 500m-2km, 27% eram 1 parada real servindo
    // varios clientes vizinhos -- ex. TTM-2G02/Rocinha): horario emprestado
    // de outro ponto do mesmo romaneio confirmado por perto, nao a
    // chegada/saida exatas DESTA loja. Decisao do usuario 30/08: marcar
    // distinto no relatorio em vez de mostrar como confirmacao normal.
    if (observacao == null && visita?.viaVizinhanca) {
      observacao = 'ENTREGUE - PARADA COMPARTILHADA COM ENTREGA PRÓXIMA (horário aproximado)'
    }
    // Achado real 06/09 (placa RQV5F67/ENCONTRO PINHEIRO RESTAURANTE): parada
    // real de 27min a 501m do ponto, 1m fora do raio normal (RAIO_ENTREGA_
    // METROS) -- ver RAIO_CONFIRMACAO_AMPLIADO_METROS/montarVisitas. Marcada
    // distinta no relatorio, nunca como confirmacao normal.
    if (observacao == null && visita?.viaRaioAmpliado) {
      observacao = 'ENTREGUE - PARADA PRÓXIMA (500-800m) MAS DENTRO DA ROTA - CONFERIR'
    }
    // Achado real 12/09 (auditoria do dia 11/09): 9 NFs na Vila do Abraao,
    // Ilha Grande, saiam como falha todo dia -- nao e' erro de geocodificacao
    // nem cadastro errado, so' se chega la de barco. Roda ANTES da
    // nomenclatura por distancia (abaixo) e antes da checagem de geoConfiavel
    // (mais abaixo): uma coordenada CORRETA numa ilha nao e' "imprecisa", e
    // "nao foi ao cliente" seria falso -- o caminhao genuinamente nao chega
    // la de estrada. O rotulo de ilha e' mais informativo que os dois. Ver
    // acesso-restrito.ts e a secao "Triagem" da spec de 12/09.
    if (observacao == null && status === 'pendente' && acessoSomentePorBarco(linha.endereco)) {
      observacao = 'CLIENTE SEM ACESSO RODOVIÁRIO (ILHA) - CONFERIR COM A OPERAÇÃO'
    }
    // Nomenclatura por evidencia de GPS -- so' pra quem ficou sem confirmacao.
    // Reusa distPropria (mesmo calculo do guard de carga transferida acima).
    if (observacao == null && status === 'pendente') {
      const dist = distPropria
      if (dist != null && dist <= RAIO_PASSOU_SEM_PARAR_M) {
        observacao = 'PASSOU NO ENDEREÇO MAS NÃO REGISTROU PARADA - CONFERIR'
      } else if (dist != null && dist > RAIO_NAO_FOI_AO_CLIENTE_M) {
        observacao = 'NÃO FOI AO CLIENTE (caminhão não esteve na região)'
      }
    }
    // Achado real 08/09 (auditoria de todas as placas do dia, placa
    // RQO2C74): CV cadastrado na Unitrac (tem rastreador), mas ZERO eventos
    // de GPS o dia inteiro -- diferente de "sem movimento" (que exige km
    // CALCULADO e baixo -- aqui nao ha nem posicao pra calcular km, entao
    // semMovimento fica false e nenhuma das duas branches acima dispara,
    // porque distPropria tambem fica null com 0 paradas). Sem isso, as 34
    // entregas dessa placa ficavam "pendente" com observacao EM BRANCO --
    // pior caso pro operador (nem "sem movimento" nem "nao foi ao cliente"
    // dizem nada). So' dispara quando ha' rastreador cadastrado mas a
    // PROPRIA placa nunca apareceu nem uma vez no feed de paradas do dia
    // (paradasProprias.length===0) -- placa sem rastreador NENHUM ja cai
    // no `!temRastreador` de outra parte do relatorio, nao precisa disto.
    // `.has()` (nao so' `.length === 0` do `?? []`) distingue "o produtor
    // buscou GPS pra essa placa e achou zero eventos" (o caso real) de
    // "essa placa nem foi consultada aqui" (map so' tem OUTRAS placas --
    // acontece em chamador parcial/teste, nao deve disparar as cegas).
    if (observacao == null && status === 'pendente' && temRastreador && paradasPorOutraPlaca.has(placaNorm) && paradasProprias.length === 0) {
      observacao = 'SEM DADO DE GPS NO DIA - RASTREADOR NÃO REPORTOU NENHUMA POSIÇÃO - CONFERIR EQUIPAMENTO'
    }
    // Achado real 11-12/09: pendente cuja coordenada nao e' confiavel merece
    // rotulo proprio -- o problema esta no CADASTRO do endereco, nao na
    // entrega. Dizer "nao foi ao cliente" aqui seria acusar o motorista com
    // base num ponto que pode estar em outro municipio.
    if (observacao == null && status === 'pendente' && !geoConfiavel && linha.lat != null) {
      // O motivo importa pra triagem: "outro municipio" quase sempre e' erro de
      // geocodificacao nossa; "outro bairro" pode ser cadastro errado do cliente
      // no romaneio. Ver a secao "Triagem" da spec de 12/09.
      const detalhe =
        linha.geoMotivo === 'municipio_divergente' ? 'COORDENADA CAIU EM OUTRO MUNICÍPIO'
        : linha.geoMotivo === 'bairro_divergente' ? 'COORDENADA CAIU EM OUTRO BAIRRO'
        : null
      observacao = detalhe
        ? `ENDEREÇO COM COORDENADA IMPRECISA - ${detalhe} - CONFERIR CADASTRO`
        : 'ENDEREÇO COM COORDENADA IMPRECISA - CONFERIR CADASTRO (não dá pra afirmar se foi ou não)'
    }
    // Ver comentario de `diaEmAndamento` na assinatura da funcao: rota ainda
    // em andamento nunca declara falha, so' espera -- substitui qualquer
    // observacao negativa (inclusive nenhuma observacao, ainda "pendente"
    // mudo) por um status neutro. So' entra depois de TODOS os ramos acima
    // rodarem, entao continua valendo pro dia estar em andamento MAS ja'
    // haver evidencia positiva (confirmado_gps/confirmado_unitrac, carga
    // transferida, raio ampliado, vizinhanca) -- so' pendente sem evidencia
    // vira "aguardando".
    if (status === 'pendente' && diaEmAndamento) {
      observacao = 'AGUARDANDO - ROTA EM ANDAMENTO, DIA AINDA NÃO FINALIZADO'
    }

    return {
      carga,
      placa: placaNorm,
      motorista: resumoCarga.motorista,
      clienteCodigo: linha.clienteCodigo,
      nf: linha.nf,
      clienteNome: linha.clienteNome,
      endereco: linha.endereco,
      saidaCd: resumoCarga.saidaCd,
      chegadaCd: resumoCarga.chegadaCd,
      tempoOperacaoMin: resumoCarga.tempoOperacaoMin,
      chegada,
      saida,
      tempoParadaMin,
      status,
      temRastreador,
      observacao,
    }
  })
}
