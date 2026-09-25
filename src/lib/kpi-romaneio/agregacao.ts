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

// Task 2 (achado real 24/09, diagnostico com GPS bruto -- posicoes_historico
// -- e Unitrac, placa RQQ5B81/23-09): `Visita.distanciaMetrosDoPonto` NAO da'
// pra confiar quando a visita veio da PONTE do monitoramento (base-horarios.ts
// passa `visitasPorNfBridge` pra montarVisitas) -- esse caminho grava
// distanciaMetrosDoPonto=0 SEMPRE (ver comentario em visitas.ts), entao
// olhar so' pra ele faria a regra de "vencedor a <=150m" nunca disparar (foi
// exatamente o que aconteceu: 0 mudancas em 2.430 NFs de 22/09 na primeira
// tentativa). A parada REAL (fisica) continua disponivel em
// `paradasPorOutraPlaca` (paradas cruas da Unitrac, com lat/lng) -- casando
// pelo horario (janela [chegada, fim] se sobrepondo a' janela da visita
// compartilhada) da' a coordenada verdadeira, INDEPENDENTE de qual fonte
// preencheu a Visita. Confirmado no caso de aceite: parada real (Unitrac)
// a -22.7100749,-42.62839 -- NF 2386225 (Jacuba) fica a 4.183m dela (Ana:
// "nao esteve no local"), NF 2386220 (mesma rua da parada) fica a 126m.
function acharCoordenadaDaParadaPropria(
  placaNorm: string,
  chegada: string,
  saida: string,
  paradasPorOutraPlaca: Map<string, UnitracParadaRow[]>,
): { lat: number; lng: number } | null {
  const inicioJanela = new Date(chegada).getTime()
  const fimJanela = new Date(saida).getTime()
  for (const p of paradasPorOutraPlaca.get(placaNorm) ?? []) {
    if (p.classificacao !== 'FORA_BASE' || p.lat == null || p.lng == null) continue
    const inicioParada = new Date(p.chegada).getTime()
    const fimParada = new Date(p.fim_real ?? p.saida ?? p.chegada).getTime()
    if (inicioParada <= fimJanela && fimParada >= inicioJanela) {
      return { lat: p.lat, lng: p.lng }
    }
  }
  return null
}

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
  // Fix 12/09 (revisao pos-guarda territorial, Finding 3): o rotulo de ilha
  // (acessoSomentePorBarco, achado real da Vila do Abraao) e' especifico do
  // romaneio da Nutry Max -- Rio Quality usa a MESMA funcao (pipeline.ts)
  // e nao deveria herdar esse comportamento sem decisao explicita. Default
  // false preserva Rio Quality como estava; o chamador da Nutry Max
  // (nutrimax/gerar/route.ts) passa true.
  verificarAcessoIlha: boolean = false,
  // Item 3b (spec 2026-09-12, "Endurecimento da confirmacao"): medido no
  // dia 11/09 pos-correcao de geocode -- 133 de 1.761 confirmacoes (7,6%)
  // tem ≤3min de dwell, e 20 paradas distintas confirmam mais de uma NF ao
  // mesmo tempo (pior caso: 1 parada de 1min confirmando 5 clientes,
  // Rodovia Amaral Peixoto, 4 KMs diferentes colapsados no mesmo ponto
  // geocodificado). Mesmo raciocinio de opt-in de verificarAcessoIlha
  // acima -- especifico da Nutry Max, default false preserva Rio Quality
  // (que usa a MESMA funcao, ver pipeline.ts) intocada.
  detectarParadaCurtaCompartilhada: boolean = false,
): LinhaDetalheEntrega[] {
  const alvoPorNf = new Map(alvos.filter(a => a.documento).map(a => [a.documento as string, a]))

  // Item 3b: agrupa NFs confirmadas por GPS que compartilham a MESMA
  // parada fisica (mesma chegada+saida da Visita -- e' a chave que
  // montarVisitas usa tanto pro "vencedor" do closest-wins quanto pros
  // que emprestaram horario via viaVizinhanca) e cuja permanencia real e
  // curta (<=3min, limiar medido, ver comentario acima). Quando o grupo
  // tem mais de um endereco DISTINTO, a parada nao da pra confirmar
  // individualmente cada NF -- vira rotulo de conferencia pra TODAS elas
  // (inclusive a que "ganhou" a visita sem viaVizinhanca), nao so' pras
  // que emprestaram horario.
  const LIMITE_PARADA_COMPARTILHADA_MIN = 3
  // Task 2 (plano 24/09, brief Ana -- RQQ5B81/NF 2386225 23/09): "confirma
  // TODO o grupo" e' generoso demais quando um dos enderecos do grupo esta
  // GENUINAMENTE perto da parada (30m, caso de aceite) e os outros a
  // centenas de metros -- fisicamente so' o perto pode ser a entrega real.
  // RAIO_VENCEDOR_PARADA_COMPARTILHADA_M/RAIO_PERDEDOR_PARADA_COMPARTILHADA_M
  // medidos contra o gabarito da Ana (scripts/medir-contra-gabarito-ana.py,
  // ver relatorio da task -- limiar escolhido nao piora chegada ≤2min/≤10min
  // no subconjunto "CÓDIGO DO CLIENTE NA MESMA PLACA" de 22/09). So' perde
  // confirmacao quem esta a mais de 300m da parada QUANDO ha' um "vencedor"
  // do MESMO grupo a <=150m -- sem vencedor claro (todos perto, ou todos
  // longe/sem coordenada), mantem o rotulo de conferencia pro grupo inteiro
  // como antes (nao ha' evidencia de qual endereco, se algum, e' o certo).
  const RAIO_VENCEDOR_PARADA_COMPARTILHADA_M = 150
  const RAIO_PERDEDOR_PARADA_COMPARTILHADA_M = 300
  const enderecosPorChaveDeParada = new Map<string, Set<string>>()
  const temVencedorProximoPorChave = new Map<string, boolean>()
  // Cache da coordenada REAL da parada por chave (ver comentario de
  // acharCoordenadaDaParadaPropria acima) -- so' precisa procurar uma vez
  // por parada compartilhada, nao uma vez por NF do grupo. `undefined` =
  // ainda nao procurado, `null` = procurado e nao achou (fallback abaixo).
  const coordenadaDaParadaPorChave = new Map<string, { lat: number; lng: number } | null>()
  // Fix round 1 (revisao 24/09 do commit d9ad438, itens 1 e 2): devolve
  // `null` (distancia DESCONHECIDA) em vez de arriscar um numero -- nunca
  // mais cai em `Visita.distanciaMetrosDoPonto` (item 2: esse campo vem 0
  // sempre que a visita e' da ponte do monitoramento, sem relacao nenhuma
  // com a distancia real -- ver comentario de acharCoordenadaDaParadaPropria)
  // e nunca decide nada pra um endereco com `geoConfiavel === false` (item
  // 1: coordenada ja' sabida como ruim -- rua homonima de outro municipio,
  // centroide de bairro -- nao pode nem "vencer" nem ser "rebaixada" por uma
  // distancia medida a partir dela). Sem numero confiavel, o chamador trata
  // como "nem vencedor nem perdedor" (mesmo efeito pratico de antes do fix:
  // mantem o rotulo de conferencia pro grupo inteiro).
  function distanciaNaParadaCompartilhada(linha: LinhaGeocodificada, visitaDaLinha: Visita, chave: string): number | null {
    if (linha.geoConfiavel === false) return null
    if (linha.lat == null || linha.lng == null) return null
    let coord = coordenadaDaParadaPorChave.get(chave)
    if (coord === undefined) {
      coord = acharCoordenadaDaParadaPropria(placaNorm, visitaDaLinha.chegada, visitaDaLinha.saida, paradasPorOutraPlaca)
      coordenadaDaParadaPorChave.set(chave, coord)
    }
    if (coord == null) return null
    return haversine(coord.lat, coord.lng, linha.lat, linha.lng)
  }
  if (detectarParadaCurtaCompartilhada) {
    for (const linha of linhasRomaneio) {
      const visita = visitasPorNf.get(linha.nf)
      if (!visita) continue
      if (minutosEntre(visita.chegada, visita.saida) > LIMITE_PARADA_COMPARTILHADA_MIN) continue
      const chave = `${visita.chegada}|${visita.saida}`
      const set = enderecosPorChaveDeParada.get(chave) ?? new Set<string>()
      set.add(linha.endereco)
      enderecosPorChaveDeParada.set(chave, set)
      const dist = distanciaNaParadaCompartilhada(linha, visita, chave)
      if (dist != null && dist <= RAIO_VENCEDOR_PARADA_COMPARTILHADA_M) {
        temVencedorProximoPorChave.set(chave, true)
      }
    }
  }

  // Fix (revisao final de branch 15/09, Critical 2): carga SEM PLACA (o
  // Romaneio do Pao pode vir com a coluna CARRO em branco) nao tem paradas
  // proprias -- `paradasPorOutraPlaca.get('')` e' vazio, `distPropria` fica
  // null, `propriaPlacaPlausivelmentePerto` fica false e
  // acharParadaDeOutraPlaca rodava SEM NENHUMA GUARDA, varrendo a frota
  // inteira e casando qualquer parada a <=500m. A NF saia CONFIRMADA com o
  // rotulo "CARGA TRANSFERIDA" -- transferencia que nunca existiu, so' a
  // placa que nao veio no documento. Pior: agregarPorCarga (que so' olha a
  // placa propria) devolvia INCOMPLETO/0 paradas pra MESMA carga, deixando o
  // relatorio contraditorio. Sem placa nao ha' como confirmar nada por GPS --
  // curto-circuita com rotulo de excecao proprio, mesmo espirito de "sem
  // rastreador"/"sem dado de GPS" acima. Rotulo generico de proposito: esta
  // funcao tambem serve o Rio Quality (kpi-rioquality/pipeline.ts).
  const semPlacaNoRomaneio = placaNorm.trim() === ''
  if (semPlacaNoRomaneio) {
    return linhasRomaneio.map((linha): LinhaDetalheEntrega => ({
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
      chegada: null,
      saida: null,
      tempoParadaMin: null,
      status: 'pendente',
      temRastreador,
      observacao: 'CARGA SEM PLACA NO ROMANEIO - CONFERIR COM A OPERAÇÃO',
    }))
  }

  return linhasRomaneio.map((linha): LinhaDetalheEntrega => {
    const alvo = alvoPorNf.get(linha.nf)
    const visita = visitasPorNf.get(linha.nf)
    const confirmadoUnitrac = alvo?.situacao === 1
    const confirmadoGps = visita != null
    // Task 2 (ver comentario de RAIO_VENCEDOR/RAIO_PERDEDOR_PARADA_
    // COMPARTILHADA_M acima): so' desconfirma quando ESTA NF (nao um
    // "vencedor" plausivel de outro endereco do grupo) esta longe da parada
    // E existe um vencedor claro (<=150m) no MESMO grupo -- se ninguem do
    // grupo esta perto, nao ha' base pra dizer QUAL endereco (se algum) e' o
    // certo, entao o grupo inteiro continua so' com o rotulo de conferencia.
    const chaveParadaCompartilhada = visita ? `${visita.chegada}|${visita.saida}` : null
    const grupoParadaCompartilhada = chaveParadaCompartilhada != null
      ? enderecosPorChaveDeParada.get(chaveParadaCompartilhada)
      : undefined
    const perdeuParadaCompartilhada = detectarParadaCurtaCompartilhada
      && visita != null
      && chaveParadaCompartilhada != null
      && grupoParadaCompartilhada != null
      && grupoParadaCompartilhada.size > 1
      && temVencedorProximoPorChave.get(chaveParadaCompartilhada) === true
      && (() => {
        const dist = distanciaNaParadaCompartilhada(linha, visita, chaveParadaCompartilhada)
        return dist != null && dist > RAIO_PERDEDOR_PARADA_COMPARTILHADA_M
      })()
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
    // Achado real 23/09 (plano 24/09, Task 1 -- Ana, TTL5J17): "sem
    // rastreador" e' um FATO JA CONHECIDO (nunca vai confirmar, nao importa
    // quanto o dia ainda tenha pela frente), diferente de "AGUARDANDO"
    // (pode ser so' atraso do equipamento, so' sabemos depois que o dia
    // acabar). Por isso so' cai aqui quando: (a) `temRastreador` e' false
    // (nunca teve cv/fonte nenhuma -- vale o dia inteiro, em andamento ou
    // nao), OU (b) tem cv mas ZERO posicoes o dia INTEIRO e o dia ja
    // ENCERROU (`!diaEmAndamento`) -- com o dia ainda em andamento, zero
    // posicoes ATE AGORA nao e' motivo pra acusar o equipamento cedo demais
    // (ver `diaEmAndamento` abaixo, que cobre esse caso mantendo AGUARDANDO).
    const semRastreadorNoDia = !temRastreador
      || (paradasPorOutraPlaca.has(placaNorm) && paradasProprias.length === 0 && !diaEmAndamento)
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
      : perdeuParadaCompartilhada
        ? 'pendente'
        : confirmadoGps || porOutraPlaca
          ? 'confirmado_gps'
          : 'pendente'
    // Perdedor da parada compartilhada: a parada e' de OUTRO endereco do
    // grupo (o vencedor a <=150m) -- mostrar o horario dessa parada como se
    // fosse a chegada/saida DESTE cliente afirmaria uma presenca que a
    // equipe ja desmentiu (caso de aceite: "nao esteve no local"). Fica sem
    // horario, igual aos demais "pendente" sem evidencia propria.
    const chegada = perdeuParadaCompartilhada
      ? null
      : visita?.chegada ?? porOutraPlaca?.parada.chegada ?? null
    const saida = perdeuParadaCompartilhada
      ? null
      : visita?.saida
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
    // Task 2 (caso de aceite RQQ5B81/NF 2386225, 23/09): roda ANTES do
    // rotulo generico de "CONFIRMOU VÁRIOS ENDEREÇOS" abaixo -- quando ha'
    // um vencedor claro (<=150m) no grupo, so' os enderecos genuinamente
    // longe (>300m) levam este rotulo; o vencedor cai no bloco seguinte
    // (mantem "ENTREGUE - PARADA CURTA..."), igual antes.
    if (observacao == null && perdeuParadaCompartilhada) {
      observacao = 'PARADA CURTA DE OUTRO ENDEREÇO - NÃO CONFIRMA ESTE CLIENTE - CONFERIR'
    }
    // Item 3b: roda ANTES de viaVizinhanca/viaRaioAmpliado de proposito --
    // quando a parada curta e' compartilhada por enderecos distintos, TODO
    // o grupo (inclusive o "vencedor" do closest-wins, que nao tem
    // viaVizinhanca) leva o MESMO rotulo de conferencia, em vez de so' os
    // que emprestaram horario aparecerem marcados e o vencedor sair como
    // CONFIRMADO (GPS) normal (a evidencia por tras dos dois e' igualmente
    // fraca: 1 parada, N enderecos).
    if (observacao == null && visita) {
      const chave = `${visita.chegada}|${visita.saida}`
      const enderecos = enderecosPorChaveDeParada.get(chave)
      if (enderecos && enderecos.size > 1) {
        observacao = 'ENTREGUE - PARADA CURTA (ATÉ 3MIN) CONFIRMOU VÁRIOS ENDEREÇOS DIFERENTES AO MESMO TEMPO - CONFERIR'
      }
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
    if (observacao == null && status === 'pendente' && verificarAcessoIlha && acessoSomentePorBarco(linha.endereco)) {
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
      } else if (dist != null) {
        // Achado real 10-09 (auditoria com a Ana, placa RQU2G47/NF 2364486):
        // parada real de 5min a 879m ficava com observacao em branco -- nem
        // confirma nem explica, o pior resultado possivel. A decisao
        // original de 05/09 deixava essa faixa muda "por nao dar pra
        // afirmar nada", mas CONFERIR nao afirma nada (nao diz "foi" nem
        // "nao foi"), so' levanta a bandeira -- mesmo espirito do rotulo de
        // 500-800m (RAIO_CONFIRMACAO_AMPLIADO_METROS/viaRaioAmpliado)
        // logo abaixo. Decisao revertida por pedido do usuario apos essa
        // auditoria.
        observacao = 'PARADA PRÓXIMA (500m-2km) MAS FORA DO ENDEREÇO - CONFERIR'
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
    // dizem nada). `.has()` (nao so' `.length === 0` do `?? []`) distingue
    // "o produtor buscou GPS pra essa placa e achou zero eventos" (o caso
    // real) de "essa placa nem foi consultada aqui" (map so' tem OUTRAS
    // placas -- acontece em chamador parcial/teste, nao deve disparar as
    // cegas). Task 1 (24/09) unificou esse rotulo com o de `!temRastreador`
    // (placa sem cv NENHUM) -- ver `semRastreadorNoDia` acima: os dois casos
    // saem igualmente da taxa de confirmacao (numerador E denominador), e o
    // texto generico "NAO CONTABILIZADO" nao afirma se o problema e' o
    // equipamento ou o cadastro.
    if (observacao == null && status === 'pendente' && semRastreadorNoDia) {
      observacao = 'SEM RASTREADOR - VEÍCULO SEM RASTREAMENTO NO DIA - NÃO CONTABILIZADO'
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
    // vira "aguardando". Fix round 1 (item 3, mesmo espirito de
    // semRastreadorNoDia/Task 1): "parada curta de outro endereco" tambem e'
    // um fato JA' RESOLVIDO (a parada que confirmaria esta NF e' de outro
    // cliente, isso nao muda esperando o dia acabar) -- nao pode virar
    // "aguardando".
    if (status === 'pendente' && diaEmAndamento && !semRastreadorNoDia && !perdeuParadaCompartilhada) {
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
