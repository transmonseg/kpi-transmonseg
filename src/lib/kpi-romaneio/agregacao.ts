import type { AlvoApi } from '@/lib/unitrac-api'
// UnitracParadaRow vem de matcher.ts, não de unitrac-api -- mesma ressalva
// de unitrac.ts (Task 6).
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import type { LinhaEscala, LinhaGeocodificada, LinhaKpiRomaneio, LinhaDetalheEntrega, StatusEntrega, Visita } from './types'
import { haversine } from '@/lib/utils/geo'
import { RAIO_ENTREGA_METROS } from './constants'

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

  const nfPlanejado = escala?.nfPlanejado ?? null
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
    ajudante1: escala?.ajudante1 ?? null,
    ajudante2: escala?.ajudante2 ?? null,
    pesoKg: escala?.pesoKg ?? null,
    clientesPlanejados: escala?.entPlanejado ?? null,
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
): LinhaDetalheEntrega[] {
  const alvoPorNf = new Map(alvos.filter(a => a.documento).map(a => [a.documento as string, a]))

  return linhasRomaneio.map((linha): LinhaDetalheEntrega => {
    const alvo = alvoPorNf.get(linha.nf)
    const visita = visitasPorNf.get(linha.nf)
    const confirmadoUnitrac = alvo?.situacao === 1
    const confirmadoGps = visita != null
    const semMovimento = kmPercorrido != null && kmPercorrido < LIMITE_KM_SEM_MOVIMENTO
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
    const distPropria = confirmadoUnitrac || confirmadoGps || semMovimento
      ? null
      : distanciaAteParadaPropria(linha, placaNorm, paradasPorOutraPlaca)
    const propriaPlacaPlausivelmentePerto = distPropria != null && distPropria <= RAIO_NAO_FOI_AO_CLIENTE_M
    // Carga transferida: so' quando a PROPRIA placa nao confirmou. Rastreador
    // travado (sem movimento) tem outra explicacao e nao vira "transferida".
    const porOutraPlaca = confirmadoUnitrac || confirmadoGps || semMovimento || propriaPlacaPlausivelmentePerto
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
