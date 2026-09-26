import type { AlvoApi } from '@/lib/unitrac-api'
// UnitracParadaRow vem de matcher.ts, não de unitrac-api -- mesma ressalva
// de unitrac.ts (Task 6).
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import type { LinhaEscala, LinhaGeocodificada, LinhaKpiRomaneio, LinhaDetalheEntrega, StatusEntrega, Visita, EvidenciaNf } from './types'
import { haversine } from '@/lib/utils/geo'
import { RAIO_ENTREGA_METROS } from './constants'
import { acessoSomentePorBarco } from './acesso-restrito'
import { instanteDeFeitoISO } from './correcao-por-alvo'

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
// Task 7 (24/09): limite SEPARADO (nao o mesmo LIMITE_KM_SEM_MOVIMENTO=2) pra
// desmentir nuncaSaiuDaBase por km de GPS continuo. Usar o MESMO limite de 2km
// pra essa checagem reintroduz o bug real do achado 08/09 (TTM2G01, km=2,44 de
// deriva de GPS parado, teste abaixo) -- viraria "CARGA TRANSFERIDA" outra vez
// so' por deriva marginal. O caso que a Task 7 resolve e' bem mais grosseiro
// (17 placas que RODARAM >50km com paradas incompletas por causa da janela de
// 48h da Unitrac) -- 10km fica confortavelmente acima de deriva parada e
// abaixo de qualquer rota real.
const LIMITE_KM_DESMENTE_NUNCA_SAIU_BASE = 10

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
// Fix round 1 (revisao 24/09 da Task 5, achado 1): a placa pode ter MAIS DE
// UMA parada crua se sobrepondo a janela [chegada,saida] da Visita (ex.
// blip de transito entrando/saindo perto do fim de uma parada real seguida
// de outra parada de verdade logo depois) -- devolver cegamente a PRIMEIRA
// batida escolhia por ordem de array, nao por qual parada de fato EXPLICA
// a Visita. Critério agora: maior sobreposição temporal (em ms) com a
// janela da Visita vence; empate (sobreposição igual) desempata pela mais
// próxima da coordenada de REFERÊNCIA (geocode do endereço, ou cadastro da
// Unitrac quando o geocode não existir/nao for confiavel -- ver
// `referenciaParaDesempate` abaixo, cada chamador decide a referencia certa
// pro seu contexto). `referencia=null` (default, usado pelo desempate de
// parada curta compartilhada -- Task 2 -- que já valida a coordenada da
// LINHA antes de chamar) desempata por sobreposição apenas, mantendo o
// comportamento de antes quando so' uma parada bate.
function acharCoordenadaDaParadaPropria(
  placaNorm: string,
  chegada: string,
  saida: string,
  paradasPorOutraPlaca: Map<string, UnitracParadaRow[]>,
  referencia: { lat: number; lng: number } | null = null,
): { lat: number; lng: number } | null {
  const inicioJanela = new Date(chegada).getTime()
  const fimJanela = new Date(saida).getTime()
  let melhor: { lat: number; lng: number; sobreposicaoMs: number; distRef: number } | null = null
  for (const p of paradasPorOutraPlaca.get(placaNorm) ?? []) {
    if (p.classificacao !== 'FORA_BASE' || p.lat == null || p.lng == null) continue
    const inicioParada = new Date(p.chegada).getTime()
    const fimParada = new Date(p.fim_real ?? p.saida ?? p.chegada).getTime()
    const sobreposicaoMs = Math.min(fimParada, fimJanela) - Math.max(inicioParada, inicioJanela)
    if (sobreposicaoMs < 0) continue // sem sobreposicao de verdade (mesmo guard <=/>= de antes)
    const distRef = referencia ? haversine(referencia.lat, referencia.lng, p.lat, p.lng) : 0
    const ganha = !melhor
      || sobreposicaoMs > melhor.sobreposicaoMs
      || (sobreposicaoMs === melhor.sobreposicaoMs && distRef < melhor.distRef)
    if (ganha) melhor = { lat: p.lat, lng: p.lng, sobreposicaoMs, distRef }
  }
  return melhor ? { lat: melhor.lat, lng: melhor.lng } : null
}

const coordValidaCadastro = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n !== 0

/** Task 5 (plano 24/09, Step 2 do brief): a ponte (base-horarios.ts) já
 *  escolhe internamente entre geocode e `latAlt`/`lngAlt` (cadastro Unitrac)
 *  pra achar a parada real -- sem mudar a ponte, distingue aqui, no KPI,
 *  comparando a distância da parada real (coordenada casada por horário via
 *  `acharCoordenadaDaParadaPropria`, nunca `Visita.distanciaMetrosDoPonto`)
 *  até o geocode do endereço E até o cadastro do alvo na Unitrac
 *  (`AlvoApi.pontoLat/pontoLng`) -- o mais perto vence. `null` em qualquer
 *  lado quando a coordenada correspondente não existe ou não é confiável
 *  (nunca inventa). */
function distanciasGeoECadastro(
  linha: LinhaGeocodificada,
  alvo: AlvoApi | undefined,
  coordParada: { lat: number; lng: number } | null,
): { distGeo: number | null; distCad: number | null } {
  if (coordParada == null) return { distGeo: null, distCad: null }
  const distGeo = linha.geoConfiavel !== false && linha.lat != null && linha.lng != null
    ? haversine(coordParada.lat, coordParada.lng, linha.lat, linha.lng)
    : null
  const distCad = alvo && coordValidaCadastro(alvo.pontoLat) && coordValidaCadastro(alvo.pontoLng)
    ? haversine(coordParada.lat, coordParada.lng, alvo.pontoLat as number, alvo.pontoLng as number)
    : null
  return { distGeo, distCad }
}

/** Fix round 1 (revisao 24/09 da Task 5, achado 1): coordenada de REFERÊNCIA
 *  usada pra desempatar `acharCoordenadaDaParadaPropria` quando duas paradas
 *  cruas tem a MESMA sobreposição temporal com a Visita -- geocode do
 *  endereço quando existe e é confiável; cadastro da Unitrac quando o
 *  geocode não existir/não for confiável. `null` quando nenhum dos dois
 *  existe (desempate cai pra ordem de chegada, mesmo comportamento antigo). */
function referenciaParaDesempate(linha: LinhaGeocodificada, alvo: AlvoApi | undefined): { lat: number; lng: number } | null {
  if (linha.geoConfiavel !== false && linha.lat != null && linha.lng != null) return { lat: linha.lat, lng: linha.lng }
  if (alvo && coordValidaCadastro(alvo.pontoLat) && coordValidaCadastro(alvo.pontoLng)) {
    return { lat: alvo.pontoLat as number, lng: alvo.pontoLng as number }
  }
  return null
}

// Fix round 1 (revisao 24/09 da Task 5, achado 2): a ponte (base-horarios.ts)
// já valida o raio antes de casar uma parada com um ponto -- mas o casamento
// POR HORÁRIO feito aqui (acharCoordenadaDaParadaPropria, janela [chegada,
// saída] da Visita) é um mecanismo INDEPENDENTE, sem raio nenhum. Quando a
// parada achada por horário fica longe de QUALQUER referência conhecida
// (geocode E cadastro, quando existem), o casamento não é confiável -- é
// coincidência de horário, não a mesma parada fisica que a ponte validou.
// A EVIDÊNCIA em si não muda (a ponte já confirmou a presença dentro do
// raio dela), só a distância exposta no relatório: melhor não mostrar
// nenhuma do que mostrar uma que não bate com a parada real.
const RAIO_CONFIANCA_CASAMENTO_POR_HORARIO_M = 800
function casamentoPorHorarioConfiavel(distGeo: number | null, distCad: number | null): boolean {
  const distancias = [distGeo, distCad].filter((d): d is number => d != null)
  if (distancias.length === 0) return true
  return distancias.some(d => d <= RAIO_CONFIANCA_CASAMENTO_POR_HORARIO_M)
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

// Task 10 (plano 24/09, achado real 22/09: ~27 NFs que a Ana vincula por
// codigo do cliente saiam "ENTREGUE" (confirmado_unitrac) SEM HORARIO nenhum
// porque o feed GPS continuo travou/sumiu bem na parada -- so' o alvo da
// Unitrac (situacao=1) confirmou. 24 das 27 estao no /stops da Unitrac (apos
// a Task 7, ja mescladas com o snapshot). Tolerancia de 10min alarga a
// janela [chegada, fim] da parada pra cobrir o atraso tipico entre o
// motorista dar baixa no app e a Unitrac fechar o cluster da parada.
const TOLERANCIA_FEITO_UNITRAC_MIN = 10
const RAIO_PARADA_FEITO_UNITRAC_M = 500

/** feitoISO e chegada/saida das paradas cruas estao na MESMA convencao
 *  mascarada (digitos BRT lidos como se fossem UTC, ver instanteDeFeitoISO
 *  em correcao-por-alvo.ts) -- comparar os dois com `new Date(...).getTime()`
 *  direto, SEM somar/subtrair fuso nenhum (bug critico de 3h ja visto neste
 *  projeto). Acha, entre as paradas FORA_BASE da propria placa, a que contem
 *  o `feitoISO` do alvo (com folga de TOLERANCIA_FEITO_UNITRAC_MIN pra
 *  ambos os lados da janela) E cujo centro esta a <=500m do cadastro
 *  Unitrac (`alvo.pontoLat/pontoLng`) OU do geocode confiavel da linha
 *  (`linha.lat/lng`, so' quando `geoConfiavel !== false`) -- o mesmo
 *  espirito de `distanciasGeoECadastro` acima, mas aqui so' precisa saber
 *  SE bate (nao qual dos dois vence) pra decidir emprestar o horario.
 *  `null` quando nao ha' parada nenhuma que satisfaca as duas condicoes --
 *  comportamento atual (sem horario) preservado.
 *
 *  Fix round 1 (revisao 24/09 da Task 10, achado da revisao de codigo):
 *  `paradasCruasDaPlaca` tem que vir do parametro dedicado
 *  `paradasUnitracCruasPropriaPlaca` (ver assinatura de
 *  `montarDetalheEntregas`), NUNCA de `paradasPorOutraPlaca` -- esse ja'
 *  passou por `resolverParadas` (unitrac.ts), que prefere a ponte do
 *  monitoramento e DESCARTA as paradas cruas da Unitrac inteiras sempre que
 *  a ponte respondeu e nao houve apagao de sinal detectado. Como o feed
 *  continuo da ponte pode congelar SEM disparar o flag de apagao (o caso
 *  exato que esta funcao resolve), buscar em `paradasPorOutraPlaca` nunca
 *  achava a parada certa -- o ganho medido offline nunca se realizaria em
 *  producao. */
function acharParadaUnitracParaFeito(
  linha: LinhaGeocodificada,
  alvo: AlvoApi,
  paradasCruasDaPlaca: UnitracParadaRow[],
): { parada: UnitracParadaRow; distParadaM: number } | null {
  if (!alvo.feitoISO) return null
  const t = instanteDeFeitoISO(alvo.feitoISO)
  const toleranciaMs = TOLERANCIA_FEITO_UNITRAC_MIN * 60_000
  let melhor: { parada: UnitracParadaRow; dist: number } | null = null
  for (const p of paradasCruasDaPlaca) {
    if (p.classificacao !== 'FORA_BASE' || p.lat == null || p.lng == null) continue
    const inicioJanela = new Date(p.chegada).getTime() - toleranciaMs
    const fimJanela = new Date(p.fim_real ?? p.saida ?? p.chegada).getTime() + toleranciaMs
    if (t < inicioJanela || t > fimJanela) continue
    const distCad = coordValidaCadastro(alvo.pontoLat) && coordValidaCadastro(alvo.pontoLng)
      ? haversine(p.lat, p.lng, alvo.pontoLat as number, alvo.pontoLng as number)
      : null
    const distGeo = linha.geoConfiavel !== false && linha.lat != null && linha.lng != null
      ? haversine(p.lat, p.lng, linha.lat, linha.lng)
      : null
    const candidatas = [distCad, distGeo].filter((d): d is number => d != null && d <= RAIO_PARADA_FEITO_UNITRAC_M)
    if (candidatas.length === 0) continue
    const dist = Math.min(...candidatas)
    if (!melhor || dist < melhor.dist) melhor = { parada: p, dist }
  }
  return melhor ? { parada: melhor.parada, distParadaM: melhor.dist } : null
}

// Task 2 (plano 2026-09-25, regra R2 -- generaliza acharParadaUnitracParaFeito
// pra NF sem confirmacao nenhuma, nao so' confirmado_unitrac sem visita):
// duracao/raio medidos contra o gabarito da Ana (mesmo espirito de
// RAIO_PARADA_FEITO_UNITRAC_M/TOLERANCIA_FEITO_UNITRAC_MIN acima).
const DURACAO_MIN_PARADA_UNITRAC_PROPRIA_MIN = 2
const RAIO_PARADA_UNITRAC_PROPRIA_M = 300
// Fix round 1 (revisao pos-medicao, achado real: analise-24-09.md media 69
// NFs com esta regra, so' 31 confirmaram na primeira implementacao) --
// texto exato da analise: "sem outro cliente da mesma placa a <=150 m".
// E' um raio FIXO em torno da PARADA (explica-se por outro cliente perto de
// verdade), nao "mais perto que a distancia desta NF" -- a versao relativa
// (primeira implementacao) rejeitava candidatas legitimas so' porque outro
// cliente, mesmo longe de qualquer explicacao plausivel (ex. 280m x 290m),
// era numericamente "mais perto".
const RAIO_OUTRO_CLIENTE_EXPLICA_M = 150

/** Ponto de referencia (geocode confiavel OU cadastro Unitrac) de OUTRA NF
 *  da mesma placa, usado so' pra desempatar `acharParadaUnitracPropria`
 *  contra o Review Focus do plano (parada perto de um cliente mas AINDA MAIS
 *  perto de outro cliente da mesma placa nao pode confirmar o errado). */
type PontoReferenciaPlacaNf = { endereco: string; lat: number; lng: number }

/** Acha, entre as paradas CRUAS da Unitrac da PROPRIA placa, a que confirma
 *  esta NF por presenca fisica (sem depender de visita GPS nem de alvo
 *  'feito'): duracao >= DURACAO_MIN_PARADA_UNITRAC_PROPRIA_MIN, centro a
 *  <= RAIO_PARADA_UNITRAC_PROPRIA_M do geocode confiavel da linha OU do
 *  cadastro Unitrac do alvo casado, e que nao esteja explicada por (a <=
 *  RAIO_OUTRO_CLIENTE_EXPLICA_M de) OUTRA NF da mesma placa com endereco
 *  diferente (Review Focus: parada perto de um cliente mas que tambem
 *  explica genuinamente outro cliente da mesma placa nao confirma este).
 *  Entre as candidatas validas, vence a de MAIOR duracao (mais provavel de
 *  ser a entrega de verdade, nao um blip de transito). `null` quando
 *  nenhuma parada satisfaz tudo isso. */
function acharParadaUnitracPropria(
  linha: LinhaGeocodificada,
  cadastro: { lat: number; lng: number } | null,
  paradasCruas: UnitracParadaRow[],
  outrosPontosDaPlaca: PontoReferenciaPlacaNf[],
): { parada: UnitracParadaRow; distParadaM: number } | null {
  const geo = linha.geoConfiavel !== false && linha.lat != null && linha.lng != null
    ? { lat: linha.lat, lng: linha.lng }
    : null
  if (geo == null && cadastro == null) return null
  let melhor: { parada: UnitracParadaRow; dist: number; duracaoMin: number } | null = null
  for (const p of paradasCruas) {
    if (p.classificacao !== 'FORA_BASE' || p.lat == null || p.lng == null) continue
    const inicio = new Date(p.chegada).getTime()
    const fim = new Date(p.fim_real ?? p.saida ?? p.chegada).getTime()
    const duracaoMin = (fim - inicio) / 60_000
    if (duracaoMin < DURACAO_MIN_PARADA_UNITRAC_PROPRIA_MIN) continue
    const distGeo = geo ? haversine(p.lat, p.lng, geo.lat, geo.lng) : null
    const distCad = cadastro ? haversine(p.lat, p.lng, cadastro.lat, cadastro.lng) : null
    const candidatas = [distGeo, distCad].filter((d): d is number => d != null && d <= RAIO_PARADA_UNITRAC_PROPRIA_M)
    if (candidatas.length === 0) continue
    const dist = Math.min(...candidatas)
    const explicadaPorOutroCliente = outrosPontosDaPlaca
      .filter(o => o.endereco !== linha.endereco)
      .some(o => haversine(p.lat as number, p.lng as number, o.lat, o.lng) <= RAIO_OUTRO_CLIENTE_EXPLICA_M)
    if (explicadaPorOutroCliente) continue
    if (!melhor || duracaoMin > melhor.duracaoMin) melhor = { parada: p, dist, duracaoMin }
  }
  return melhor ? { parada: melhor.parada, distParadaM: melhor.dist } : null
}

// Task 2 (plano 2026-09-25): rotulos que ja' sao "ENTREGUE" mas com ressalva
// (mesmo quando o STATUS por baixo ja e' confirmado_unitrac/confirmado_gps --
// ex. situacao=1 da Unitrac + visita com raio ampliado/parada curta
// compartilhada, achado real TOS0G53/2388187, RQU2G47/2387959: 43 dos 69 da
// analise tem 'feito' Unitrac batendo, ou seja confirmadoUnitrac=true, e a
// primeira implementacao os excluia so' por checar o enum de status) ou
// "pendente" com observacao de CONFERIR/falha por distancia -- os rotulos
// listados no brief MAIS os dois que a analise mostra que R2 tambem
// recupera ("compartilhada"/viaVizinhanca e "curta de outro endereco"/
// perdeuParadaCompartilhada). Nunca inclui "sem rastreador", "carga
// transferida"/outra placa, "veiculo sem movimento" nem "tempo em loja" --
// nenhum desses e' fato que uma parada da propria placa deva sobrepor.
const PREFIXO_OBS_COORDENADA_IMPRECISA = 'ENDEREÇO COM COORDENADA IMPRECISA'
function elegivelParaConfirmarPorParadaPropria(status: StatusEntrega, observacao: string | null): boolean {
  // Ja' e' ENTREGUE limpo (nenhuma ressalva, seja o status confirmado_unitrac
  // ou confirmado_gps) -- nada a fazer, ver caso de aceite (e).
  if (observacao == null) return status === 'pendente'
  return observacao === 'ENTREGUE - PARADA CURTA (ATÉ 3MIN) CONFIRMOU VÁRIOS ENDEREÇOS DIFERENTES AO MESMO TEMPO - CONFERIR'
    || observacao === 'ENTREGUE - PARADA PRÓXIMA (500-800m) MAS DENTRO DA ROTA - CONFERIR'
    || observacao === 'ENTREGUE - PARADA COMPARTILHADA COM ENTREGA PRÓXIMA (horário aproximado)'
    || observacao === 'PASSOU NO ENDEREÇO MAS NÃO REGISTROU PARADA - CONFERIR'
    || observacao === 'PARADA PRÓXIMA (500m-2km) MAS FORA DO ENDEREÇO - CONFERIR'
    || observacao === 'NÃO FOI AO CLIENTE (caminhão não esteve na região)'
    || observacao === 'PARADA CURTA DE OUTRO ENDEREÇO - NÃO CONFIRMA ESTE CLIENTE - CONFERIR'
    || observacao.startsWith(PREFIXO_OBS_COORDENADA_IMPRECISA)
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

  // Task 9 (plano 24/09): paradas físicas FORA_BASE da placa -- ver
  // comentário completo de `paradasForaBase` em types.ts. Sem janela por
  // carga (paradasGps já chega aqui como o dia INTEIRO da placa, ver
  // chamador em route.ts/pipeline.ts), conta o dia inteiro; placa com mais
  // de uma carga no dia repete o mesmo número em cada uma.
  const paradasForaBase = paradasGps.filter(p => p.classificacao === 'FORA_BASE').length

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
    paradasForaBase,
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
  // Fix round 1 (revisao 24/09 da Task 10, achado da revisao de codigo):
  // `paradasPorOutraPlaca` (acima) e' o resultado de `resolverParadas`
  // (unitrac.ts) -- quando a ponte do monitoramento respondeu por essa
  // placa e NAO houve apagao de sinal detectado, `resolverParadas` prefere
  // a ponte e DESCARTA as paradas cruas da Unitrac inteiramente (mesmo
  // quando a ponte tambem congelou sem disparar o flag de apagao -- e'
  // exatamente o caso das NFs que a Task 10 resolve). Buscar a parada do
  // `feitoISO` em `paradasPorOutraPlaca` nesse cenario nunca encontra nada,
  // mesmo quando a Unitrac tem a parada certa. Este parametro recebe as
  // paradas CRUAS da Unitrac da propria placa (o que `paradasEfetivas`
  // devolve, ja mescladas com o snapshot da Task 7 -- ANTES de
  // `resolverParadas` escolher entre ponte/Unitrac), independente do que o
  // resto do fluxo usa pra chegada/saida/distancia. Default vazio preserva
  // o comportamento de quem nao passar nada (mesmo espirito dos outros
  // defaults acima).
  paradasUnitracCruasPropriaPlaca: Map<string, UnitracParadaRow[]> = new Map(),
  // Revisao final pre-deploy (24/09, item 1): `semRastreadorNoDia` e o rotulo
  // unificado "SEM RASTREADOR - VEICULO SEM RASTREAMENTO NO DIA - NAO
  // CONTABILIZADO" (Task 1 + fix 7b09c40) sao decisao da Nutry Max -- o Rio
  // Quality usa esta MESMA funcao (pipeline.ts) e herdou o comportamento
  // sem decisao (sobrescrevendo "PLACA SEM RASTREADOR CADASTRADO - COMPLETAR
  // FROTA" do gerador e suprimindo os rotulos de geocode do RQ). Mesmo padrao
  // opt-in de `verificarAcessoIlha`: default false = comportamento exato de
  // 108b4bb (placa sem CV fica sem observacao; CV sem posicao nenhuma no dia
  // leva o rotulo antigo "NENHUMA POSICAO REPORTADA", que AGUARDANDO
  // sobrescreve). Nutry Max (route.ts + scripts/gerar-nutrimax-real-arquivo.ts)
  // passa true.
  tratarSemRastreadorNoDia: boolean = false,
  // Task 1 (plano 2026-09-25, mudanca de requisito pos-brief -- decisao do
  // usuario e da operacao): na Nutry Max NAO EXISTE "entrega por outra
  // placa" -- o brief original tentou distinguir troca de rota real de
  // coincidencia (>=5 NFs), mas a operacao decidiu que essa confirmacao nao
  // deve existir de jeito nenhum pra Nutry Max, nem com rotulo novo. Opt-in
  // (mesmo padrao de tratarSemRastreadorNoDia acima): com
  // `desativarOutraPlaca` ligado, `acharParadaDeOutraPlaca` NUNCA confirma
  // nada -- a NF segue a classificacao normal pela PROPRIA placa (pendente/
  // rotulos de distancia normais; a Task 2 podera confirma-la depois pela
  // parada Unitrac da propria placa). Default false preserva Rio Quality
  // (que usa esta MESMA funcao, pipeline.ts) e o comportamento antigo pra
  // quem nao passar nada; Nutry Max (route.ts + scripts/gerar-nutrimax-real-
  // arquivo.ts) passa true.
  desativarOutraPlaca: boolean = false,
  // Task 2 (plano 2026-09-25, R2): generaliza acharParadaUnitracParaFeito --
  // NF sem confirmacao limpa (pendente, ou confirmado_gps ambiguo, ver
  // elegivelParaConfirmarPorParadaPropria acima) usa a parada Unitrac CRUA
  // da PROPRIA placa (paradasUnitracCruasPropriaPlaca, ja existente) pra
  // confirmar por presenca fisica, sem depender de visita GPS nem de alvo
  // 'feito'. Mesmo padrao opt-in de desativarOutraPlaca/tratarSemRastreadorNoDia
  // acima: default false preserva Rio Quality (pipeline.ts) e quem nao
  // passar nada; Nutry Max (route.ts + gerar-nutrimax-real-arquivo.ts) passa
  // true. Nunca sobrepoe ENTREGUE limpo da ponte/Unitrac, ENTREGUE POR OUTRA
  // PLACA nem SEM RASTREADOR (ver elegivelParaConfirmarPorParadaPropria).
  confirmarPorParadaUnitracPropria: boolean = false,
  // Fix round 2 (revisao de codigo, achado MÉDIO agregacao.ts:626-633): as
  // paradas cruas da Unitrac (`paradasUnitracCruasPropriaPlaca`) sao do DIA
  // INTEIRO da placa, mas `pontosReferenciaDaPlaca` (abaixo) so' enxergava as
  // NFs desta CARGA -- uma parada a <=150m de um cliente de OUTRA carga da
  // MESMA placa no mesmo dia nao era descartada (Review Focus: "explicada
  // por outro cliente da mesma placa" nao pode se limitar a' carga atual).
  // Default = `linhasRomaneio` preserva o comportamento antigo pra quem nao
  // passar nada (Rio Quality, testes existentes com 1 carga so'); Nutry Max
  // (route.ts + gerar-nutrimax-real-arquivo.ts) passa `linhasPorPlaca.get(
  // placaNorm)` (TODAS as cargas da placa no dia, ja calculado no chamador).
  todasLinhasDaPlacaNoDia: LinhaGeocodificada[] = linhasRomaneio,
): LinhaDetalheEntrega[] {
  const alvoPorNf = new Map(alvos.filter(a => a.documento).map(a => [a.documento as string, a]))
  // Task 2 (R2): pontos de referencia de CADA NF da placa no DIA INTEIRO
  // (todas as cargas, Fix round 2) -- usado pra descartar `acharParadaUnitrac
  // Propria` quando a parada e' "explicada" por OUTRO cliente da mesma placa
  // (Review Focus). Fix round 2 (achado MENOR): cada NF entra com os DOIS
  // pontos disponiveis (geocode confiavel E cadastro Unitrac), nao so' um --
  // `referenciaParaDesempate` escolhe so' o preferido (geocode > cadastro),
  // que escondia o cadastro sempre que o geocode tambem existisse. Calculado
  // uma vez por chamada, nao por NF.
  const pontosReferenciaDaPlaca: PontoReferenciaPlacaNf[] = todasLinhasDaPlacaNoDia
    .flatMap((l): PontoReferenciaPlacaNf[] => {
      const alvoL = alvoPorNf.get(l.nf)
      const pontos: PontoReferenciaPlacaNf[] = []
      if (l.geoConfiavel !== false && l.lat != null && l.lng != null) {
        pontos.push({ endereco: l.endereco, lat: l.lat, lng: l.lng })
      }
      if (alvoL && coordValidaCadastro(alvoL.pontoLat) && coordValidaCadastro(alvoL.pontoLng)) {
        pontos.push({ endereco: l.endereco, lat: alvoL.pontoLat as number, lng: alvoL.pontoLng as number })
      }
      return pontos
    })
  // Revisao final pre-deploy (24/09, item 3): sinais INDEPENDENTES das
  // paradas de que a placa rodou no dia -- desmentem o caso (b) de
  // semRastreadorNoDia ("tem CV mas zero posicoes"). `alvos` chega aqui como
  // TODOS os alvos da placa no dia (alvosPorPlaca no chamador), nao so' os
  // desta carga.
  const placaTemAlvoFeitoNoDia = alvos.some(a => a.situacao === 1)
  const placaRodouPorKm = kmPercorrido != null && kmPercorrido > 0

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
      // referencia = geocode desta LINHA (ja validado logo acima -- lat/lng
      // presentes e geoConfiavel !== false): desempata entre paradas cruas
      // com a MESMA sobreposicao temporal pela mais perto do endereco que
      // esta pedindo a coordenada (fix round 1, achado 1).
      coord = acharCoordenadaDaParadaPropria(placaNorm, visitaDaLinha.chegada, visitaDaLinha.saida, paradasPorOutraPlaca, { lat: linha.lat, lng: linha.lng })
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
      // Sem placa nao ha' GPS de placa nenhuma pra medir contra -- nunca
      // sem_rastreador (esse rotulo e' especificamente "a placa existe mas
      // nao tem fonte de rastreamento", diferente de "nao ha placa
      // nenhuma pra rastrear").
      evidencia: 'sem_evidencia',
      distParadaM: null,
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
    // Revisao final (item 3): o caso (b) tambem exige que nao haja alvo
    // 'feito' da Unitrac pra placa no dia nem km > 0 -- qualquer um dos dois
    // prova que o veiculo foi rastreado/rodou, so' as paradas que faltaram.
    const zeroPosicoesNoDia = paradasPorOutraPlaca.has(placaNorm) && paradasProprias.length === 0
    const semRastreadorNoDia = tratarSemRastreadorNoDia && (
      !temRastreador
      || (zeroPosicoesNoDia && !diaEmAndamento && !placaTemAlvoFeitoNoDia && !placaRodouPorKm)
    )
    const nuncaSaiuDaBase = paradasProprias.length > 0 && paradasProprias.every(p => p.classificacao === 'BASE')
    // Achado real 22-23/09 (Task 7, plano 24/09): /stops da Unitrac so' guarda
    // 48h -- gerar um dia depois disso (dia antigo reprocessado) trazia
    // paradas incompletas, e nuncaSaiuDaBase virava true so' porque faltava
    // dado (nao porque o caminhao realmente nunca saiu). 54 NFs de 22/09 (17
    // placas que RODARAM >50km de verdade) saiam "VEICULO SEM MOVIMENTO".
    // km do GPS continuo (calcularKmPercorrido, fonte independente das
    // paradas classificadas) ACIMA do limite desmente nuncaSaiuDaBase.
    const semMovimento = (kmPercorrido != null && kmPercorrido < LIMITE_KM_SEM_MOVIMENTO)
      || (nuncaSaiuDaBase && (kmPercorrido == null || kmPercorrido < LIMITE_KM_DESMENTE_NUNCA_SAIU_BASE))
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
    // Task 1 (plano 2026-09-25, mudanca de requisito): `desativarOutraPlaca`
    // ligado desliga `acharParadaDeOutraPlaca` de vez -- Nutry Max nao
    // confirma NF nenhuma por "outra placa", nem com rotulo velho nem novo.
    // A NF cai pros ramos normais abaixo (pendente/rotulos por distancia,
    // ou a Task 2 confirmando pela parada Unitrac da propria placa depois).
    const porOutraPlaca = confirmadoUnitrac || confirmadoGps || semMovimento || propriaPlacaPlausivelmentePerto || !geoConfiavel || desativarOutraPlaca
      ? null
      : acharParadaDeOutraPlaca(linha, placaNorm, paradasPorOutraPlaca)
    // Task 10 (plano 24/09): confirmado so' pelo alvo da Unitrac, sem Visita
    // de GPS -- procura na propria placa a parada FORA_BASE que contem o
    // feitoISO do alvo (ver acharParadaUnitracParaFeito). So' entra quando
    // ha' alvo de verdade (sempre ha', confirmadoUnitrac exige alvo?.situacao
    // ===1) e nao ha' Visita (senao o GPS continuo ja' resolveu o horario).
    const paradaUnitracFeito = confirmadoUnitrac && !confirmadoGps && alvo
      ? acharParadaUnitracParaFeito(linha, alvo, paradasUnitracCruasPropriaPlaca.get(placaNorm) ?? [])
      : null

    let status: StatusEntrega = confirmadoUnitrac
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
    let chegada = perdeuParadaCompartilhada
      ? null
      : visita?.chegada ?? paradaUnitracFeito?.parada.chegada ?? porOutraPlaca?.parada.chegada ?? null
    let saida = perdeuParadaCompartilhada
      ? null
      : visita?.saida
        ?? (paradaUnitracFeito ? paradaUnitracFeito.parada.fim_real ?? paradaUnitracFeito.parada.saida ?? paradaUnitracFeito.parada.chegada : null)
        ?? porOutraPlaca?.parada.fim_real ?? porOutraPlaca?.parada.saida ?? porOutraPlaca?.parada.chegada
        ?? null
    let tempoParadaMin = chegada && saida ? minutosEntre(chegada, saida) : null

    let observacao: string | null = null
    // Correcao pontual (achado real 23/09, placa TTL5J17): "sem rastreador"
    // (placa DECLARADA sem cv pela operacao, Task 8) e "outra placa
    // comprovadamente entregou" (porOutraPlaca -- evidencia POSITIVA de
    // entrega) rodam ANTES de "sem movimento" de proposito. semMovimento
    // so' descreve um SINTOMA do GPS (rastreador travado/parado) -- quando
    // ja sabemos que a placa nem tem rastreador, o sintoma e' irrelevante e
    // so' atrapalha: gerador-xlsx.ts exclui da taxa automatica pelo PREFIXO
    // "SEM RASTREADOR" (ver PREFIXO_OBS_SEM_RASTREADOR), entao deixar
    // semMovimento vencer aqui travava a observacao e a NF ficava,
    // incorretamente, DENTRO da taxa de falha (22 das 23 NFs do caso real,
    // so' 1 escapava por nao bater semMovimento). porOutraPlaca continua
    // sendo checado primeiro: se outra placa da frota genuinamente entregou,
    // isso e' fato positivo e nao cede pra sem rastreador nem sem movimento.
    if (observacao == null && porOutraPlaca) {
      observacao = `ENTREGUE POR OUTRA PLACA (${porOutraPlaca.placa}) - CARGA TRANSFERIDA`
    }
    if (observacao == null && status === 'pendente' && semRastreadorNoDia) {
      observacao = 'SEM RASTREADOR - VEÍCULO SEM RASTREAMENTO NO DIA - NÃO CONTABILIZADO'
    }
    if (observacao == null && status === 'pendente' && semMovimento) {
      observacao = 'VEÍCULO SEM MOVIMENTO NO DIA - CONFERIR RASTREADOR OU SE SAIU PRA RUA'
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
    // porque distPropria tambem fica null com 0 paradas). `.has()` (nao so'
    // `.length === 0` do `?? []`) distingue "o produtor buscou GPS pra essa
    // placa e achou zero eventos" (o caso real) de "essa placa nem foi
    // consultada aqui" (map so' tem OUTRAS placas -- acontece em chamador
    // parcial/teste, nao deve disparar as cegas). Task 1 (24/09) unificou
    // esse rotulo com o de `!temRastreador` (placa sem cv NENHUM) -- ver
    // `semRastreadorNoDia` acima: os dois casos saem igualmente da taxa de
    // confirmacao (numerador E denominador). Correcao pontual 23/09: o
    // rotulo em si agora e' atribuido MAIS ACIMA (logo apos porOutraPlaca,
    // antes de semMovimento) -- ver comentario la' -- pra prevalecer sobre
    // "sem movimento" em vez de ser bloqueado por ele.
    // Revisao final (item 1): com `tratarSemRastreadorNoDia` desligado (Rio
    // Quality), o rotulo antigo de 108b4bb continua valendo, na MESMA posicao
    // da cadeia de antes (e sobrescrito por AGUARDANDO, como antes).
    if (!tratarSemRastreadorNoDia && observacao == null && status === 'pendente' && temRastreador && zeroPosicoesNoDia) {
      observacao = 'SEM RASTREADOR - NENHUMA POSIÇÃO REPORTADA NO DIA - CONFERIR EQUIPAMENTO'
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
    // Task 2 (plano 2026-09-25, R2 -- caso de aceite: planilha de ocorrencias
    // rotuladas pela equipe 24/09): NF ainda sem confirmacao limpa (pendente,
    // ou confirmado_gps ambiguo -- ver elegivelParaConfirmarPorParadaPropria)
    // usa a parada Unitrac CRUA da PROPRIA placa pra confirmar por presenca
    // fisica. Roda DEPOIS de R1 (porOutraPlaca) e da visita da ponte (visita/
    // paradaUnitracFeito ja decidiram status/observacao acima), ANTES do
    // rotulo de AGUARDANDO -- nunca sobrepoe ENTREGUE limpo da ponte/Unitrac,
    // ENTREGUE POR OUTRA PLACA nem SEM RASTREADOR (todos ja' saem da whitelist
    // de elegivelParaConfirmarPorParadaPropria).
    let paradaPropriaConfirmada: { parada: UnitracParadaRow; distParadaM: number } | null = null
    if (confirmarPorParadaUnitracPropria && elegivelParaConfirmarPorParadaPropria(status, observacao)) {
      const cadastro = alvo && coordValidaCadastro(alvo.pontoLat) && coordValidaCadastro(alvo.pontoLng)
        ? { lat: alvo.pontoLat as number, lng: alvo.pontoLng as number }
        : null
      paradaPropriaConfirmada = acharParadaUnitracPropria(
        linha, cadastro, paradasUnitracCruasPropriaPlaca.get(placaNorm) ?? [], pontosReferenciaDaPlaca,
      )
      if (paradaPropriaConfirmada) {
        status = 'confirmado_gps'
        chegada = paradaPropriaConfirmada.parada.chegada
        saida = paradaPropriaConfirmada.parada.fim_real ?? paradaPropriaConfirmada.parada.saida ?? paradaPropriaConfirmada.parada.chegada
        tempoParadaMin = chegada && saida ? minutosEntre(chegada, saida) : null
        observacao = null
      }
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

    // Task 5 (plano 24/09, requisito P0 da Ana: "expor origem, método e
    // distância; não equiparar parada em rua semelhante a entrega") --
    // EvidenciaNf: mesma precedência documentada no comentário do tipo
    // (types.ts), calculada a partir dos MESMOS marcadores já usados acima
    // pra observacao/status (viaRaioAmpliado, viaVizinhanca, porOutraPlaca,
    // confirmado_unitrac, perdeuParadaCompartilhada, semRastreadorNoDia) --
    // nunca lê `Visita.distanciaMetrosDoPonto` (ver acharCoordenadaDaParada
    // Propria acima: SEMPRE 0 quando a Visita veio da ponte do
    // monitoramento). distParadaM só vem preenchido quando a distância foi
    // de fato medida contra uma coordenada real -- `null` nunca é inventado.
    let evidencia: EvidenciaNf
    let distParadaM: number | null = null
    if (paradaPropriaConfirmada) {
      evidencia = 'parada_unitrac_propria'
      distParadaM = Math.round(paradaPropriaConfirmada.distParadaM)
    } else if (status === 'pendente' && semRastreadorNoDia) {
      evidencia = 'sem_rastreador'
    } else if (porOutraPlaca) {
      evidencia = 'outra_placa'
      distParadaM = linha.lat != null && linha.lng != null && porOutraPlaca.parada.lat != null && porOutraPlaca.parada.lng != null
        ? haversine(porOutraPlaca.parada.lat, porOutraPlaca.parada.lng, linha.lat, linha.lng)
        : null
    } else if (confirmadoUnitrac && !confirmadoGps) {
      evidencia = 'alvo_feito_unitrac'
      // Task 10: quando a parada Unitrac emprestou chegada/saida (achou o
      // feitoISO dentro de uma parada FORA_BASE da propria placa perto do
      // cadastro/geocode), expoe a distancia real -- `null` quando nao
      // achou (comportamento atual, sem horario, preservado).
      distParadaM = paradaUnitracFeito ? Math.round(paradaUnitracFeito.distParadaM) : null
    } else if (perdeuParadaCompartilhada) {
      // NF que PERDEU: a parada real e' de outro endereco do grupo -- nao e'
      // evidencia NENHUMA a favor desta NF (mesmo espirito de nao mostrar
      // horario nenhum pra ela, ver `chegada`/`saida` acima). A distancia
      // ainda e' MEDIDA (foi ela quem decidiu a perda), so' nao vira uma das
      // evidencias positivas.
      evidencia = 'sem_evidencia'
      distParadaM = chaveParadaCompartilhada != null && visita
        ? distanciaNaParadaCompartilhada(linha, visita, chaveParadaCompartilhada)
        : null
    } else if (visita && grupoParadaCompartilhada != null && grupoParadaCompartilhada.size > 1) {
      evidencia = 'parada_curta_compartilhada'
      distParadaM = chaveParadaCompartilhada != null
        ? distanciaNaParadaCompartilhada(linha, visita, chaveParadaCompartilhada)
        : null
    } else if (visita?.viaVizinhanca) {
      evidencia = 'vizinhanca'
      const referencia = referenciaParaDesempate(linha, alvo)
      distParadaM = distanciasGeoECadastro(
        linha, alvo, acharCoordenadaDaParadaPropria(placaNorm, visita.chegada, visita.saida, paradasPorOutraPlaca, referencia),
      ).distGeo
    } else if (visita?.viaRaioAmpliado) {
      evidencia = 'raio_ampliado'
      const referencia = referenciaParaDesempate(linha, alvo)
      distParadaM = distanciasGeoECadastro(
        linha, alvo, acharCoordenadaDaParadaPropria(placaNorm, visita.chegada, visita.saida, paradasPorOutraPlaca, referencia),
      ).distGeo
    } else if (visita) {
      const referencia = referenciaParaDesempate(linha, alvo)
      const coordParada = acharCoordenadaDaParadaPropria(placaNorm, visita.chegada, visita.saida, paradasPorOutraPlaca, referencia)
      const { distGeo, distCad } = distanciasGeoECadastro(linha, alvo, coordParada)
      const confiavel = casamentoPorHorarioConfiavel(distGeo, distCad)
      if (distCad != null && (distGeo == null || distCad < distGeo)) {
        evidencia = 'parada_no_cadastro_unitrac'
        distParadaM = confiavel ? distCad : null
      } else {
        evidencia = 'parada_no_endereco'
        distParadaM = confiavel ? distGeo : null
      }
    } else if (distPropria != null) {
      // Task 9 (plano 24/09, requisito da Ana: rótulos por distância própria
      // sem evidência/distância expostas -- 69 NFs em 23/09). Mesma
      // precedência/thresholds já usados na "Nomenclatura por evidencia de
      // GPS" acima (RAIO_PASSOU_SEM_PARAR_M/RAIO_NAO_FOI_AO_CLIENTE_M) --
      // nunca duplica regra, só espelha em EvidenciaNf pra expor a
      // distância junto (`observacao` continua igual, calculado acima).
      // `distPropria` já vem `null` quando a geo não é confiável (ver
      // definição de `distPropria` acima), então `distPropria != null` já
      // garante geo confiável -- não precisa checar `geoConfiavel` de novo.
      distParadaM = Math.round(distPropria)
      if (distPropria <= RAIO_PASSOU_SEM_PARAR_M) {
        evidencia = 'passagem_sem_parada' // "PASSOU NO ENDEREÇO MAS NÃO REGISTROU PARADA"
      } else if (distPropria > RAIO_NAO_FOI_AO_CLIENTE_M) {
        evidencia = 'sem_evidencia' // "NÃO FOI AO CLIENTE"
      } else {
        evidencia = 'parada_proxima_fora_raio' // "PARADA PRÓXIMA (500m-2km) MAS FORA DO ENDEREÇO"
      }
    } else {
      evidencia = 'sem_evidencia'
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
      evidencia,
      distParadaM,
    }
  })
}
