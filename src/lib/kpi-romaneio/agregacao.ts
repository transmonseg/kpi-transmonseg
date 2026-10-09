import type { AlvoApi } from '@/lib/unitrac-api'
// UnitracParadaRow vem de matcher.ts, não de unitrac-api -- mesma ressalva
// de unitrac.ts (Task 6).
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import type { LinhaEscala, LinhaGeocodificada, LinhaKpiRomaneio, LinhaDetalheEntrega, StatusEntrega, Visita, EvidenciaNf, ConfiancaNf } from './types'
import { OBS_NAO_SAIU_DA_BASE } from './types'
import { haversine } from '@/lib/utils/geo'
import { RAIO_ENTREGA_METROS, BASES_COORD_NUTRIMAX } from './constants'
import { acessoSomentePorBarco } from './acesso-restrito'
import { expandirTipoLogradouro, limparLixoInicio } from './normalizar-endereco'
import { instanteDeFeitoISO } from './correcao-por-alvo'
import { hojeBR } from '@/lib/data-br'
import { extraiLojaLocal } from '@/lib/parsers/extrai-loja-local'
import { isRotaGigante } from '@/lib/kpi/rotas-gigantes'

// Achado real 26/09 (grupo, KPI de 25/09 entregue as 06:17 de 26/09): os dois
// chamadores de producao (route.ts + scripts/gerar-nutrimax-real-arquivo.ts)
// duplicavam `data === hojeBR() && chegadaCd == null` cada um por conta
// propria -- unica fonte de verdade agora, pra nao poder um dos dois divergir
// (copiar/colar errado, esquecer o `&& chegadaCd`, etc) e deixar
// `diaEmAndamento` true pra um relatorio de um DIA JA ENCERRADO (o `hoje`
// injetavel e' so' pra teste deterministico, producao sempre usa o default
// real). Ver comentario de `diaEmAndamento` nas assinaturas abaixo pro
// raciocinio completo de "por que so' isso nao basta pra acusar falha".
export function calcularDiaEmAndamento(
  data: string,
  chegadaCd: string | null,
  hoje: string = hojeBR(),
): boolean {
  return data === hoje && chegadaCd == null
}

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

// Task 3 (plano 26/09, verificacao manual 24-09 -- 4 casos reais RQV9E37/
// 2388069 (GPS a 8m), TUO1D10/2388557 (340m), RBJ7H78/2389720 (143m),
// RQU2E34/2389291 (400m) saindo "NAO FOI AO CLIENTE" quando o GPS BRUTO
// (posicoes_historico, cruzado manualmente pela operacao) mostra o
// caminhao a poucos metros/centenas de metros do endereco). Diagnostico:
// `distanciaAteParadaPropria` (acima) so' enxerga PARADAS reais (dwell
// classificado FORA_BASE) -- se o caminhao passou perto SEM parar, nao ha'
// parada nenhuma ali pra medir contra, entao a distancia cai pra' a parada
// real mais proxima que existir no dia (a proxima entrega, tipicamente a
// km de distancia) e o caso vira falsamente "NAO FOI" (>2km) em vez de
// "PASSOU...". Os thresholds (RAIO_PASSOU_SEM_PARAR_M=500,
// RAIO_NAO_FOI_AO_CLIENTE_M=2000) NAO sao o problema -- os 4 casos reais
// (8-400m) ja cairiam certinho em PASSOU se `distPropria` refletisse a
// distancia real do trajeto.
//
// Duas melhorias com dado que JA' chega neste arquivo (nenhuma consulta
// nova, nenhuma mudanca na ponte):
// 1) `paradasPorOutraPlaca` (passado pro chamador, ja' escolhido por
//    resolverParadas entre Unitrac/ponte) e `paradasUnitracCruasPropriaPlaca`
//    (paradas CRUAS da Unitrac, sempre buscadas independente de quem
//    "ganhou") podem discordar -- uma delas pode ter um cluster que a
//    outra descartou. Usa a MENOR das duas, nunca ignora uma parada real
//    so' porque a outra fonte "venceu" o resolverParadas.
// 2) Quando o CHAMADOR tiver a distancia real do trajeto continuo pra essa
//    NF (`menorDistanciaTrajetoM`, ver comentario em
//    `menorDistanciaTrajetoPorNf` na assinatura de `montarDetalheEntregas`),
//    usa a MENOR entre ela e a distancia por parada -- o trajeto continuo
//    e' estritamente mais fino (pega passagem sem parar que nenhuma parada
//    jamais capturaria) mas nunca DESCARTA uma parada real mais perto (ex.
//    ruido de amostragem do trajeto).
//
// RESOLVIDO (Task 3b, verificacao manual 26/09): o CONCERN original daqui
// dizia que nenhum chamador de producao preenchia `menorDistanciaTrajetoPorNf`
// porque a ponte (base-horarios.ts, projeto irmao "monitoramento") nao
// expunha uma distancia minima ao ponto independente de dwell. A ponte
// agora devolve `menorDistanciaM` por visita (VisitaPonto, route.ts do
// monitoramento -- menor distancia haversine a QUALQUER leitura do trajeto
// na janela da rota, null sem posicao), propagado ate' aqui via
// `HorarioBase.visitasPorNf[nf].menorDistanciaM` (base-horarios.ts) e
// montado no Map que este parametro espera por
// `montarMenorDistanciaTrajetoPorNf` (base-horarios.ts), que os dois
// chamadores de producao do fluxo Nutry Max (route.ts +
// scripts/gerar-nutrimax-real-arquivo.ts) ja passam pra
// `montarDetalheEntregas`. Os 4 casos reais do brief (verificados contra
// posicoes_historico manualmente) agora tem a melhoria (2) tambem rodando
// em producao, nao so' a (1).
function melhorDistanciaPropria(
  linha: LinhaGeocodificada,
  placaNorm: string,
  paradasPorOutraPlaca: Map<string, UnitracParadaRow[]>,
  paradasUnitracCruasPropriaPlaca: Map<string, UnitracParadaRow[]>,
  menorDistanciaTrajetoM: number | null,
): number | null {
  const distParadaResolvida = distanciaAteParadaPropria(linha, placaNorm, paradasPorOutraPlaca)
  const distParadaCrua = distanciaAteParadaPropria(linha, placaNorm, paradasUnitracCruasPropriaPlaca)
  const distParadas = distParadaResolvida != null && (distParadaCrua == null || distParadaResolvida <= distParadaCrua)
    ? distParadaResolvida
    : distParadaCrua
  if (menorDistanciaTrajetoM == null) return distParadas
  if (distParadas == null) return menorDistanciaTrajetoM
  return Math.min(distParadas, menorDistanciaTrajetoM)
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

// Task 4 (plano 26/09, verificacao manual 24/09 -- caso real RBJ2J67/carga
// 98593, escala e romaneio: 18 clientes cujo GPS da placa escalada ficou a
// 3-10km enquanto a RQV6I51 parou a 8-400m deles): "na Nutry Max nao existe
// troca de caminhao" (decisao do usuario 26/09) -- a parada de outro
// veiculo NUNCA confirma a entrega (isso seria voltar a' "ENTREGUE POR
// OUTRA PLACA", que `desativarOutraPlaca` ja desliga de proposito). Aqui
// ela e' usada so' como SINAL, junto com a distancia da PROPRIA placa, pra
// decidir se a escala/romaneio provavelmente erraram a placa da carga --
// nesse caso a NF nao pode virar "NAO FOI" (acusaria o motorista errado)
// nem ficar muda, tem que pedir conferencia da escala. Limiares:
// RAIO_ESCALA_DIVERGENTE_PROPRIA_M reusa o mesmo teto de "nao foi ao
// cliente" (RAIO_NAO_FOI_AO_CLIENTE_M) -- mesma nocao de "nunca chegou
// perto de verdade"; RAIO/DURACAO da parada de outra placa sao mais
// permissivos que RAIO_ENTREGA_METROS de proposito (aqui e' so' indicio,
// nao confirmacao -- o caso real tem paradas ate' 400m).
const MIN_NFS_ESCALA_DIVERGENTE = 5
const RAIO_ESCALA_DIVERGENTE_PROPRIA_M = RAIO_NAO_FOI_AO_CLIENTE_M
const PROPORCAO_MIN_ESCALA_DIVERGENTE = 0.5
const RAIO_ESCALA_DIVERGENTE_OUTRA_PLACA_M = 500
const DURACAO_MIN_ESCALA_DIVERGENTE_OUTRA_PLACA_MIN = 2

/** true quando alguma placa da frota (que nao a esperada) tem uma parada
 *  FORA_BASE com dwell >= DURACAO_MIN_ESCALA_DIVERGENTE_OUTRA_PLACA_MIN a
 *  <= RAIO_ESCALA_DIVERGENTE_OUTRA_PLACA_M do ponto -- SINAL, nunca
 *  confirmacao (ver comentario acima). Nao devolve qual placa/parada: o
 *  chamador so' precisa saber SE existe, pra decidir "escala provavelmente
 *  errada" no nivel da carga. */
function existeParadaDeOutraPlacaComoSinal(
  linha: LinhaGeocodificada,
  placaEsperada: string,
  paradasPorOutraPlaca: Map<string, UnitracParadaRow[]>,
): boolean {
  if (linha.lat == null || linha.lng == null) return false
  for (const [outraPlaca, paradas] of paradasPorOutraPlaca) {
    if (outraPlaca === placaEsperada) continue
    for (const p of paradas) {
      if (p.classificacao !== 'FORA_BASE' || p.lat == null || p.lng == null) continue
      const duracaoMin = minutosEntre(p.chegada, p.fim_real ?? p.saida ?? p.chegada)
      if (duracaoMin < DURACAO_MIN_ESCALA_DIVERGENTE_OUTRA_PLACA_MIN) continue
      if (haversine(p.lat, p.lng, linha.lat, linha.lng) <= RAIO_ESCALA_DIVERGENTE_OUTRA_PLACA_M) return true
    }
  }
  return false
}

/** Fix round 1 (revisao de codigo, achado 1 -- 79351d8): precedencia por NF,
 *  nao so' por carga. A carga pode ser `escalaDivergente` (a MAIORIA dos
 *  clientes) e ainda assim ESTA NF especifica ter a propria placa
 *  genuinamente perto (passou a 300m, ou parou a 900m) -- a evidencia
 *  INDIVIDUAL manda sobre o sinal agregado da carga: 'PASSOU NO ENDERECO...'
 *  (propria placa <=500m) e 'PARADA PROXIMA (500m-2km)...' (propria placa
 *  entre 500m-2km) dizem que a PROPRIA placa chegou perto de VERDADE desta
 *  NF -- nao faz sentido pedir conferencia de escala pra uma entrega que a
 *  placa escalada comprovadamente visitou. So' NF ainda "pendente" (nenhuma
 *  confirmacao limpa, nenhum rotulo de fato ja resolvido -- SEM RASTREADOR/
 *  SEM MOVIMENTO/parada curta compartilhada perdida/ilha) SEM evidencia de
 *  proximidade da propria placa (observacao null, "NAO FOI" -- >2km -- ou
 *  coordenada nao confiavel, onde a propria distancia nem pode ser medida)
 *  e' elegivel. */
function elegivelParaEscalaDivergente(status: StatusEntrega, observacao: string | null): boolean {
  if (status !== 'pendente') return false
  if (observacao == null) return true
  return observacao === 'NÃO FOI AO CLIENTE (caminhão não esteve na região)'
    || observacao.startsWith(PREFIXO_OBS_COORDENADA_IMPRECISA)
    || observacao === OBS_ENDERECO_NAO_LOCALIZADO
}

// Task 2 (plano 2026-09-26, rodizio de carga inteira -- analise-escala-25-09.md:
// em 25/09 as 3 cargas de Campos rodaram trocadas entre 3 placas, cada placa a
// dezenas de km da propria carga e cobrindo 100% da carga de outra; 24/09
// RBJ2J67 <-> RQV6I51). E' a UNICA excecao a `desativarOutraPlaca`: so' vale
// numa carga ja' `escalaDivergente` e coberta por UM unico outro veiculo em
// >=80% das NFs (parada >=2min a <=300m). Carro que parou perto de um ou
// outro cliente por acaso nunca chega perto desse limiar. Confirmacao por NF
// usa o mesmo criterio forte da R2 em modoPrecisao (<=100m, ou 100-300m com
// >=5min) -- parada fraca do executor nao confirma (NF segue CONFERIR ESCALA).
const PROPORCAO_MIN_RODIZIO = 0.8
const RAIO_RODIZIO_M = 300
const DURACAO_MIN_RODIZIO_MIN = 2

/** Pontos de referencia de UMA NF (geocode confiavel e/ou cadastro Unitrac),
 *  mesma nocao da R2 (`acharParadaUnitracPropria`). */
function pontosDaNf(linha: LinhaGeocodificada, alvo: AlvoApi | undefined): { lat: number; lng: number }[] {
  const pontos: { lat: number; lng: number }[] = []
  if (linha.geoConfiavel !== false && linha.lat != null && linha.lng != null) pontos.push({ lat: linha.lat, lng: linha.lng })
  if (alvo && coordValidaCadastro(alvo.pontoLat) && coordValidaCadastro(alvo.pontoLng)) {
    pontos.push({ lat: alvo.pontoLat as number, lng: alvo.pontoLng as number })
  }
  return pontos
}

/** Melhor parada FORA_BASE (>=2min, <=300m de algum ponto da NF) de um
 *  veiculo -- forte vence fraca; entre iguais, a mais perto. */
function acharParadaDoExecutor(
  pontos: { lat: number; lng: number }[],
  paradas: UnitracParadaRow[],
): { parada: UnitracParadaRow; distM: number; forte: boolean } | null {
  if (pontos.length === 0) return null
  let melhor: { parada: UnitracParadaRow; distM: number; forte: boolean } | null = null
  for (const p of paradas) {
    if (p.classificacao !== 'FORA_BASE' || p.lat == null || p.lng == null) continue
    const duracaoMin = (new Date(p.fim_real ?? p.saida ?? p.chegada).getTime() - new Date(p.chegada).getTime()) / 60_000
    if (duracaoMin < DURACAO_MIN_RODIZIO_MIN) continue
    const distM = Math.min(...pontos.map(o => haversine(p.lat as number, p.lng as number, o.lat, o.lng)))
    if (distM > RAIO_RODIZIO_M) continue
    const forte = distM <= RAIO_R2_FORTE_CURTO_M || duracaoMin >= DURACAO_R2_FORTE_LONGE_MIN
    const ganha = !melhor
      || (forte && !melhor.forte)
      || (forte === melhor.forte && distM < melhor.distM)
    if (ganha) melhor = { parada: p, distM, forte }
  }
  return melhor
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

// Item 1 (auditoria Ana 30/09, Parte B -- 24 ENTREGUE sem horario de 29/09):
// o motorista da' a baixa na Unitrac ATRASADO e em LOTE, 12-97 min depois da
// parada -- a janela +-10 min acima descartava 21 paradas que existiam. So'
// modoPrecisao e so' preenche chegada/saida/tempo (status/taxa intactos).
const DURACAO_MIN_PARADA_ANTES_DA_BAIXA_MIN = 2
const RAIO_PARADA_ANTES_DA_BAIXA_CADASTRO_M = 150
const JANELA_MAX_FIM_ANTES_DA_BAIXA_MIN = 120
// Entre candidatas, parada a <= este raio do cadastro vence as de 100-150 m;
// so' depois vale a mais perto da baixa. Caso real RQV3J99 29/09 (Pro Pao e
// Bar do Junior): a "ultima antes da baixa" pura pegava 08:42-08:47 a 118-145
// m (parada de outro cliente) em vez da propria 08:20-08:34 a 28-40 m.
const RAIO_PARADA_ANTES_DA_BAIXA_FORTE_M = 100
// Conflito: geocode confiavel longe do cadastro -> um dos dois esta' errado
// (Xavier 1,8 km, Sabor do Campo 1,8 km, Super Massas 3,3 km, Marvila 28,9 km).
const CONFLITO_GEO_CADASTRO_BAIXA_M = 1_000
// Cadastro identico (<= RAIO_CADASTRO_IDENTICO_M) ao de OUTRO cliente da placa
// e sem geocode confiavel que o corrobore (<= RAIO_GEO_CORROBORA_CADASTRO_M):
// cadastro suspeito (RQS2F79 Mercadinho Pinheiro, mesmo ponto de 2 outros
// clientes, NF em outra estrada) -- so' com parada marcada com o codigo dele.
const RAIO_CADASTRO_IDENTICO_M = 10
const RAIO_GEO_CORROBORA_CADASTRO_M = 300

/** Revisao 30/09 (A1): codigos de cliente que a parada traz -- `codigo_loja`
 *  e cada geofence "CODIGO - NOME" do `local_parada` (sem ROTA generica nem
 *  rota gigante, que nao identificam cliente). Vazio = parada sem codigo. */
function codigosDeClienteDaParada(p: UnitracParadaRow): Set<string> {
  const out = new Set<string>()
  if (p.codigo_loja && !isRotaGigante(p.codigo_loja)) out.add(p.codigo_loja)
  for (const seg of (p.local_parada ?? '').split(',')) {
    const { codigo_loja } = extraiLojaLocal(seg)
    if (codigo_loja && !isRotaGigante(codigo_loja)) out.add(codigo_loja)
  }
  return out
}

/** Parada FORA_BASE da propria placa (crua ou ponte) >= 2 min, centro a <=
 *  150 m do cadastro Unitrac, que comeca antes da baixa (`feitoISO`) e termina
 *  no maximo 2 h antes dela -- entre as validas, as a <= 100 m do cadastro
 *  primeiro e, dentro disso, a que comeca mais perto da baixa. `outrosCadastros` = cadastros de OUTROS clientes (codigo Unitrac
 *  diferente) da placa no dia. Uma parada pode servir varias NFs. */
function acharParadaAntesDaBaixa(
  linha: LinhaGeocodificada,
  alvo: AlvoApi,
  paradasDaPlaca: UnitracParadaRow[],
  outrosCadastros: { lat: number; lng: number }[],
): { parada: UnitracParadaRow; distParadaM: number } | null {
  if (!alvo.feitoISO) return null
  const cadastro = cadastroDoAlvo(alvo)
  if (!cadastro) return null
  const geo = linha.geoConfiavel !== false && linha.lat != null && linha.lng != null
    ? haversine(linha.lat, linha.lng, cadastro.lat, cadastro.lng)
    : null
  if (geo != null && geo > CONFLITO_GEO_CADASTRO_BAIXA_M) return null
  const cadastroSuspeito = (geo == null || geo > RAIO_GEO_CORROBORA_CADASTRO_M)
    && outrosCadastros.some(o => haversine(o.lat, o.lng, cadastro.lat, cadastro.lng) <= RAIO_CADASTRO_IDENTICO_M)
  const t = instanteDeFeitoISO(alvo.feitoISO)
  let melhor: { parada: UnitracParadaRow; dist: number; iniMs: number; forte: boolean } | null = null
  for (const p of paradasDaPlaca) {
    if (p.classificacao !== 'FORA_BASE' || p.lat == null || p.lng == null) continue
    if (duracaoParadaMin(p) < DURACAO_MIN_PARADA_ANTES_DA_BAIXA_MIN) continue
    const iniMs = new Date(p.chegada).getTime()
    if (iniMs >= t || fimParadaMs(p) < t - JANELA_MAX_FIM_ANTES_DA_BAIXA_MIN * 60_000) continue
    const dist = haversine(p.lat, p.lng, cadastro.lat, cadastro.lng)
    if (dist > RAIO_PARADA_ANTES_DA_BAIXA_CADASTRO_M) continue
    // A1 (revisao 30/09): parada que traz codigo(s) de cliente e nenhum e' o
    // desta NF e' de OUTRO cliente, mesmo a <=100 m -- nunca da' horario.
    const codigos = codigosDeClienteDaParada(p)
    if (codigos.size > 0 && !codigos.has(alvo.codigoUnitrac)) continue
    if (cadastroSuspeito && !codigos.has(alvo.codigoUnitrac)) continue
    const forte = dist <= RAIO_PARADA_ANTES_DA_BAIXA_FORTE_M
    const ganha = !melhor || (forte && !melhor.forte) || (forte === melhor.forte && iniMs > melhor.iniMs)
    if (ganha) melhor = { parada: p, dist, iniMs, forte }
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
// Task 1 (plano 2026-09-26, especificacao da Ana 26/09 -- "precisao acima de
// cobertura"): com `modoPrecisao`, R2 so' CONFIRMA com criterio forte --
// <=100m com >=2min, ou 100-300m com >=5min. Candidata que so' passa no
// criterio antigo (100-300m, 2-5min) vira REVISAR, nunca ENTREGUE.
const RAIO_R2_FORTE_CURTO_M = 100
const DURACAO_R2_FORTE_LONGE_MIN = 5

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
 *  nenhuma parada satisfaz tudo isso.
 *
 *  Task 1 (plano 26/09): `forte` diz se a parada escolhida passa no criterio
 *  forte (ver RAIO_R2_FORTE_CURTO_M/DURACAO_R2_FORTE_LONGE_MIN). Com
 *  `preferirForte` (modoPrecisao), uma candidata forte sempre vence uma
 *  fraca, mesmo mais curta; sem ele, a escolha e' exatamente a antiga (maior
 *  duracao) e `forte` e' so' informativo. */
// Task 3 (plano 28/09, caso real TOS5E38/2393419 26/09): a API /stops da
// Unitrac as vezes FUNDE duas paradas vizinhas numa so' -- o centro da fundida
// cai entre as duas (310 m do cadastro, parada real a 32 m). Parada longa
// (>=8 min) ganha tolerancia ate' 350 m; curta continua no teto de 300 m
// (raio maior sem parada longa = FP comprovado no estudo 26/09).
const RAIO_PARADA_FUNDIDA_M = 350
const DURACAO_MIN_PARADA_FUNDIDA_MIN = 8

function acharParadaUnitracPropria(
  linha: LinhaGeocodificada,
  cadastro: { lat: number; lng: number } | null,
  paradasCruas: UnitracParadaRow[],
  outrosPontosDaPlaca: PontoReferenciaPlacaNf[],
  preferirForte: boolean = false,
  // Task 3 (plano 28/09): paradas da PONTE (GPS continuo, separa melhor o que
  // a /stops fundiu) da propria placa -- so' entram como candidatas no
  // criterio curto forte (<=RAIO_R2_FORTE_CURTO_M com >=2 min), com o mesmo
  // descarte de outro cliente a <=150 m. Default vazio = comportamento antigo.
  paradasPonte: UnitracParadaRow[] = [],
): { parada: UnitracParadaRow; distParadaM: number; forte: boolean } | null {
  const geo = linha.geoConfiavel !== false && linha.lat != null && linha.lng != null
    ? { lat: linha.lat, lng: linha.lng }
    : null
  if (geo == null && cadastro == null) return null
  let melhor: { parada: UnitracParadaRow; dist: number; duracaoMin: number; forte: boolean } | null = null
  // Fix round 1 (medicao real 28/09): so' conta como PONTE a parada que nao e'
  // o mesmo objeto de uma crua (quando resolverParadas escolhe a Unitrac, as
  // "paradas da ponte" sao as proprias cruas -- nao ha' fonte independente).
  // (mesmo objeto, ou mesmo id -- ids da Unitrac sao '<placa>-api-N', da ponte '<placa>-ponte-N').
  const cruasSet = new Set(paradasCruas)
  const cruasIds = new Set(paradasCruas.map(p => p.id))
  const ponteIndependente = paradasPonte.filter(p => !cruasSet.has(p) && !cruasIds.has(p.id))
  const candidatasTodas = [
    ...paradasCruas.map(p => ({ p, daPonte: false })),
    ...ponteIndependente.map(p => ({ p, daPonte: true })),
  ]
  for (const { p, daPonte } of candidatasTodas) {
    if (p.classificacao !== 'FORA_BASE' || p.lat == null || p.lng == null) continue
    const duracaoMin = duracaoParadaMin(p)
    if (duracaoMin < DURACAO_MIN_PARADA_UNITRAC_PROPRIA_MIN) continue
    const distGeo = geo ? haversine(p.lat, p.lng, geo.lat, geo.lng) : Infinity
    const distCad = cadastro ? haversine(p.lat, p.lng, cadastro.lat, cadastro.lng) : Infinity
    const dist = Math.min(distGeo, distCad)
    const raio = daPonte
      ? RAIO_R2_FORTE_CURTO_M
      : duracaoMin >= DURACAO_MIN_PARADA_FUNDIDA_MIN ? RAIO_PARADA_FUNDIDA_M : RAIO_PARADA_UNITRAC_PROPRIA_M
    if (dist > raio) continue
    // Fix round 1 (FP real RQQ5B81/2386225 23/09, equipe "nao esteve no
    // local"): parada da ponte so' vale quando a crua da Unitrac de fato
    // FUNDIU paradas ali (crua sobreposta no tempo, mais longa e com centro
    // deslocado) -- sem crua nenhuma nao ha' fusao pra corrigir.
    if (daPonte && !paradasCruas.some(c => cruaFundiuEstaParada(c, p))) continue
    // Fix round 1 (FP real RQV9B26/2392758 26/09, relatorio Unitrac: nunca
    // parou no cliente): a tolerancia 300-350 m so' existe pra parada FUNDIDA.
    // Se a ponte (fonte independente) viu a MESMA parada no mesmo lugar, nao
    // houve fusao -- o centro esta' longe de verdade.
    if (!daPonte && dist > RAIO_PARADA_UNITRAC_PROPRIA_M
      && ponteIndependente.some(q => mesmaParadaFisica(p, q))) continue
    const explicadaPorOutroCliente = outrosPontosDaPlaca
      .filter(o => o.endereco !== linha.endereco)
      .some(o => haversine(p.lat as number, p.lng as number, o.lat, o.lng) <= RAIO_OUTRO_CLIENTE_EXPLICA_M)
    if (explicadaPorOutroCliente) continue
    const forte = dist <= RAIO_R2_FORTE_CURTO_M || duracaoMin >= DURACAO_R2_FORTE_LONGE_MIN
    const ganha = !melhor
      || (preferirForte && forte && !melhor.forte)
      || ((!preferirForte || forte === melhor.forte) && duracaoMin > melhor.duracaoMin)
    if (ganha) melhor = { parada: p, dist, duracaoMin, forte }
  }
  return melhor ? { parada: melhor.parada, distParadaM: melhor.dist, forte: melhor.forte } : null
}

function sobrepoeNoTempo(a: UnitracParadaRow, b: UnitracParadaRow): boolean {
  const ini = Math.max(new Date(a.chegada).getTime(), new Date(b.chegada).getTime())
  const fim = Math.min(new Date(a.fim_real ?? a.saida ?? a.chegada).getTime(), new Date(b.fim_real ?? b.saida ?? b.chegada).getTime())
  return fim > ini
}
// Mesmo raio curto da R2 forte: centros a <=100 m = mesmo lugar.
function mesmaParadaFisica(a: UnitracParadaRow, b: UnitracParadaRow): boolean {
  if (b.classificacao !== 'FORA_BASE' || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return false
  return sobrepoeNoTempo(a, b) && haversine(a.lat, a.lng, b.lat, b.lng) <= RAIO_R2_FORTE_CURTO_M
}
function cruaFundiuEstaParada(crua: UnitracParadaRow, ponte: UnitracParadaRow): boolean {
  if (crua.classificacao !== 'FORA_BASE' || crua.lat == null || crua.lng == null || ponte.lat == null || ponte.lng == null) return false
  return sobrepoeNoTempo(crua, ponte)
    && duracaoParadaMin(crua) > duracaoParadaMin(ponte)
    && haversine(crua.lat, crua.lng, ponte.lat, ponte.lng) > RAIO_R2_FORTE_CURTO_M
}

// Plano 2026-09-28 (recuperar pendentes com prova forte, estudo 26/09 secao
// 5): parada da PROPRIA placa -- crua da Unitrac OU da ponte (GPS continuo),
// as duas listas juntas -- perto o bastante de um ponto da NF (geocode
// confiavel ou cadastro Unitrac) e longa o bastante pra valer como prova de
// presenca. `ref` diz qual ponto da NF ficou mais perto (vira a EVIDÊNCIA).
type ParadaProvada = { parada: UnitracParadaRow; distM: number; ref: 'geo' | 'cad' }

function cadastroDoAlvo(alvo: AlvoApi | undefined): { lat: number; lng: number } | null {
  return alvo && coordValidaCadastro(alvo.pontoLat) && coordValidaCadastro(alvo.pontoLng)
    ? { lat: alvo.pontoLat as number, lng: alvo.pontoLng as number }
    : null
}

function duracaoParadaMin(p: UnitracParadaRow): number {
  return (new Date(p.fim_real ?? p.saida ?? p.chegada).getTime() - new Date(p.chegada).getTime()) / 60_000
}

/** Melhor parada FORA_BASE com duracao >= `duracaoMinMin` e centro a <=
 *  `raioM` do geocode confiavel ou do cadastro -- a mais perto vence (empate:
 *  a mais longa). `outrosPontosDaPlaca` != null descarta parada a <=
 *  RAIO_OUTRO_CLIENTE_EXPLICA_M de outro cliente (endereco diferente) da
 *  placa, mesmo criterio da R2; null = sem esse descarte. */
function acharParadaPropriaProvada(
  linha: LinhaGeocodificada,
  cadastro: { lat: number; lng: number } | null,
  paradas: UnitracParadaRow[],
  raioM: number,
  duracaoMinMin: number,
  outrosPontosDaPlaca: PontoReferenciaPlacaNf[] | null,
): ParadaProvada | null {
  const geo = linha.geoConfiavel !== false && linha.lat != null && linha.lng != null
    ? { lat: linha.lat, lng: linha.lng }
    : null
  if (geo == null && cadastro == null) return null
  let melhor: (ParadaProvada & { duracaoMin: number }) | null = null
  for (const p of paradas) {
    if (p.classificacao !== 'FORA_BASE' || p.lat == null || p.lng == null) continue
    const duracaoMin = duracaoParadaMin(p)
    if (duracaoMin < duracaoMinMin) continue
    const distGeo = geo ? haversine(p.lat, p.lng, geo.lat, geo.lng) : Infinity
    const distCad = cadastro ? haversine(p.lat, p.lng, cadastro.lat, cadastro.lng) : Infinity
    const distM = Math.min(distGeo, distCad)
    if (distM > raioM) continue
    if (outrosPontosDaPlaca && outrosPontosDaPlaca
      .filter(o => o.endereco !== linha.endereco)
      .some(o => haversine(p.lat as number, p.lng as number, o.lat, o.lng) <= RAIO_OUTRO_CLIENTE_EXPLICA_M)) continue
    const ganha = !melhor || distM < melhor.distM || (distM === melhor.distM && duracaoMin > melhor.duracaoMin)
    if (ganha) melhor = { parada: p, distM, ref: distCad < distGeo ? 'cad' : 'geo', duracaoMin }
  }
  return melhor ? { parada: melhor.parada, distM: melhor.distM, ref: melhor.ref } : null
}

// Task 1 (plano 28/09): 'PARADA COMPARTILHADA - REVISAR' (horario emprestado
// do vizinho) vira ENTREGUE quando ha' prova forte -- alvo Unitrac feito, ou
// parada da propria placa >=3 min a <=100 m. SEM o descarte de "outro cliente
// a <=150 m": na parada compartilhada o vizinho esta' perto por definicao (e'
// exatamente o que fazia a R2 descartar RQV3J99/2393491, 10 min a 9 m).
const DURACAO_MIN_COMPARTILHADA_PROVADA_MIN = 3
const RAIO_COMPARTILHADA_PROVADA_M = 100
const OBS_COMPARTILHADA_APROXIMADA = 'ENTREGUE - PARADA COMPARTILHADA COM ENTREGA PRÓXIMA (horário aproximado)'
// Task 2 (plano 28/09): perdedor da parada curta compartilhada com OUTRA
// parada da propria placa perto (raio = teto da R2, RAIO_PARADA_UNITRAC_PROPRIA_M).
const DURACAO_MIN_OUTRO_ENDERECO_PROVADO_MIN = 3
const OBS_PARADA_CURTA_OUTRO_ENDERECO = 'PARADA CURTA DE OUTRO ENDEREÇO - NÃO CONFIRMA ESTE CLIENTE - CONFERIR'
// Plano 29/09 (verificacao-pendentes-28-09-completa.md): 'PARADA PRÓXIMA
// (500m-2km) MAS FORA DO ENDEREÇO - CONFERIR' vira ENTREGUE so' com parada da
// PROPRIA placa (crua Unitrac ou ponte) >= DURACAO_MIN_PARADA_PROXIMA_PROPRIA_MIN
// a RAIO_MIN..RAIO_MAX_PARADA_PROXIMA_PROPRIA_M do cadastro/geocode confiavel da
// NF, e ISOLADA: nenhum outro cliente (endereco diferente) da placa no dia a
// <= RAIO_OUTRO_CLIENTE_EXPLICA_M dela nem mais perto dela que esta NF. 4 de 5
// casos reais de 28/09 eram passagem (1 leitura v=0), transito ou parada de
// outro cliente -- a duracao minima corta a passagem/transito (leitura unica
// no trevo, ~1 min) e o isolamento corta a parada de outro cliente.
const DURACAO_MIN_PARADA_PROXIMA_PROPRIA_MIN = 2
const RAIO_MIN_PARADA_PROXIMA_PROPRIA_M = 500
const RAIO_MAX_PARADA_PROXIMA_PROPRIA_M = 2_000
const OBS_PARADA_PROXIMA_FORA = 'PARADA PRÓXIMA (500m-2km) MAS FORA DO ENDEREÇO - CONFERIR'
// 06/10: o rotulo acima saia so' pela distancia do TRAJETO -- carro que so'
// passou a 1 km virava "parada proxima" (6 das 25 NFs da revisao da tia Erica).
export const OBS_PASSOU_PERTO_SEM_PARAR = 'PASSOU A 500m-2km SEM PARAR - CONFERIR'
export const OBS_ENTREGUE_PARADA_PROXIMA = 'ENTREGUE - PARADA PRÓXIMA (500m-2km)'

// Guardas (verificacao-20-parada-proxima.md, 29/09 -- 4 FPs em 20 NFs):
// (2) geocode confiavel x cadastro Unitrac a mais de DIVERGENCIA_GEO_CADASTRO_M
// -> um dos dois esta' errado; mede SO' pelo geocode (RQU3F71: cadastro a 27 km
// deixava um posto no centro "mais perto" que Morangaba).
const DIVERGENCIA_GEO_CADASTRO_M = 2_000
// Guarda 4 (Task 2 plano 2026-09-30, item 4 -- RQV3G18 2395214 29/09, Alto
// Grande: 3 min a 1,97 km, em transito sem desvio, localidade inexistente no
// mapa): medindo pelo geocode SEM fonte conhecida (`geoSemFonte`), a parada
// precisa ter >= DURACAO_MIN_PARADA_PROXIMA_GEO_SEM_FONTE_MIN ou ser um desvio
// dedicado (vai e volta fora do sentido da rota -- TOS6H57/Fonseca 29/09):
// o trajeto parada-anterior -> esta -> proxima e' >= RAZAO_DESVIO_DEDICADO x
// o direto e acrescenta >= EXTRA_MIN_DESVIO_DEDICADO_M.
const DURACAO_MIN_PARADA_PROXIMA_GEO_SEM_FONTE_MIN = 3
const RAZAO_DESVIO_DEDICADO = 1.5
const EXTRA_MIN_DESVIO_DEDICADO_M = 1_000
type ParadaComCoord = UnitracParadaRow & { lat: number; lng: number }
function ehDesvioDedicado(p: ParadaComCoord, paradas: UnitracParadaRow[]): boolean {
  const iniMs = new Date(p.chegada).getTime()
  const fimMs = fimParadaMs(p)
  let antes: ParadaComCoord | null = null
  let depois: ParadaComCoord | null = null
  for (const q of paradas) {
    if (q.lat == null || q.lng == null) continue
    const qc = q as ParadaComCoord
    if (fimParadaMs(qc) < iniMs) {
      if (!antes || fimParadaMs(qc) > fimParadaMs(antes)) antes = qc
    } else if (new Date(qc.chegada).getTime() > fimMs) {
      if (!depois || new Date(qc.chegada).getTime() < new Date(depois.chegada).getTime()) depois = qc
    }
  }
  if (!antes || !depois) return false
  const ida = haversine(antes.lat, antes.lng, p.lat, p.lng)
  const volta = haversine(p.lat, p.lng, depois.lat, depois.lng)
  const direto = haversine(antes.lat, antes.lng, depois.lat, depois.lng)
  return ida + volta - direto >= EXTRA_MIN_DESVIO_DEDICADO_M && ida + volta >= RAZAO_DESVIO_DEDICADO * direto
}
function ehParadaDaPonte(p: UnitracParadaRow): boolean {
  return p.id.includes('-ponte-')
}
function fimParadaMs(p: UnitracParadaRow): number {
  return new Date(p.fim_real ?? p.saida ?? p.chegada).getTime()
}
/** Janela [ini, fim] (ms) que ja' serviu de prova pra OUTRA NF da placa. */
type JanelaProvaOutraNf = { endereco: string; iniMs: number; fimMs: number }

/** Parada propria isolada perto da NF (ver constantes acima). Entre as
 *  validas vence a mais perto da NF (empate: a mais longa). Guardas 29/09:
 *  (1) descarta parada cuja janela ja' e' prova de outra NF da placa
 *  (`janelasProvaOutrasNfs`) e o isolamento conta tambem vizinhos com
 *  coordenada NAO confiavel (`outrosPontosDaPlaca` ja' vem com eles);
 *  (2) ver DIVERGENCIA_GEO_CADASTRO_M; (3) com `ponteComSinal` (GPS bruto da
 *  ponte sem apagao), parada crua da Unitrac so' vale se uma parada da ponte
 *  sobreposta no tempo tiver >= DURACAO_MIN tambem (a Unitrac infla a duracao:
 *  TUS1A47, "3 min" com 1 min parado e 64 km/h depois). */
// Auditoria visual da Ana 03/10 (NM 02/10): entrega real em que a PROPRIA
// placa parou UMA vez e atendeu dois clientes vizinhos (TOPS a 62 m da
// parada e o vizinho a 13 m; VENYR a 76 m e o vizinho a 77 m; HOTEL PATROPI
// a 247 m com 7 min). A R2 descarta essas paradas porque "outro cliente da
// placa explica" (RAIO_OUTRO_CLIENTE_EXPLICA_M) -- aqui a parada E' do
// vizinho e tambem desta NF. Criterio: parada da propria placa de 2 a 60 min
// a <=100 m do CADASTRO Unitrac do cliente. So' vale quando outro cliente da
// placa esta' de fato a <=150 m da parada (senao a R2 ja' teria decidido).
const RAIO_COMPARTILHADA_VIZINHO_M = 100
const DURACAO_MAX_COMPARTILHADA_VIZINHO_MIN = 60
// Achado real 02/10 (RQV3J99/2403633 Panificadora Pratense): parada propria
// de 23 min a 46 m do geocode saia "PASSOU NO ENDEREÇO MAS NÃO REGISTROU
// PARADA" -- a parada existe, so' foi atribuida ao vizinho (Mercearia do Ze
// Romeu, cadastro a 7 m). Continua pendente (sem cadastro Unitrac que prove),
// so' o texto passa a dizer o que o GPS mostra.
export const PREFIXO_OBS_PAROU_COM_VIZINHO = 'PAROU NO ENDEREÇO JUNTO COM OUTRO CLIENTE DA MESMA PLACA'
const RAIO_PAROU_COM_VIZINHO_M = 100
const DURACAO_MIN_PAROU_COM_VIZINHO_MIN = 2
export const PREFIXO_OBS_CADASTRO_DIVERGENTE = 'CADASTRO DO CLIENTE NA UNITRAC DIVERGE DO ENDEREÇO DO ROMANEIO'
// Auditoria 07/10: entregue por parada a >1 km do endereco e fora do bairro/
// municipio dele. Continua ENTREGUE (o carro volta no mesmo ponto dia apos dia:
// o cliente fica la', o endereco do romaneio/cadastro e' que esta' errado) --
// so' vira aviso de cadastro. Ver parada-fora-do-endereco.ts.
export const PREFIXO_OBS_PARADA_FORA_DO_ENDERECO = 'ENTREGUE - LOCAL DA ENTREGA FORA DO ENDEREÇO DO ROMANEIO'
const DIVERGENCIA_CADASTRO_ROMANEIO_M = 1_000
const ROTULOS_SEM_PROVA_CADASTRO = new Set<string>([
  'PASSOU NO ENDEREÇO MAS NÃO REGISTROU PARADA - CONFERIR',
  'NÃO FOI AO CLIENTE (caminhão não esteve na região)',
  'PARADA PRÓXIMA (500m-2km) MAS FORA DO ENDEREÇO - CONFERIR',
  OBS_PASSOU_PERTO_SEM_PARAR,
  'PARADA CURTA DE OUTRO ENDEREÇO - NÃO CONFIRMA ESTE CLIENTE - CONFERIR',
  '',
])
export const OBS_COMPARTILHADA_VIZINHO = 'ENTREGUE - PARADA COMPARTILHADA COM CLIENTE VIZINHO DA MESMA PLACA'

function acharParadaCompartilhadaComVizinho(
  linha: LinhaGeocodificada,
  cadastro: { lat: number; lng: number } | null,
  paradas: UnitracParadaRow[],
  outrosPontosDaPlaca: PontoReferenciaPlacaNf[],
): ParadaProvada | null {
  // So' o CADASTRO Unitrac (ponto do codigo do cliente) prova aqui: os
  // falsos positivos ja' auditados com parada dividida (RQQ5B81/2386225 "nao
  // esteve no local", RQV9D97/2395585 "nao foi", estudo 30/09) batiam so'
  // com o geocode do endereco; os 4 da Ana batiam com o cadastro.
  // Auditoria Ana 03/10 (2403636 MERCADO DO ERALDO): coordenada do endereco
  // conferida por pessoa vale como o cadastro (parada de 23 min a 0 m do
  // ponto corrigido, com 3 vizinhos a <50 m).
  const geoVerificado = linha.geoVerificadoManual && linha.lat != null && linha.lng != null
    ? { lat: linha.lat, lng: linha.lng } : null
  if (cadastro == null && geoVerificado == null) return null
  let melhor: { parada: UnitracParadaRow; distM: number; ref: 'geo' | 'cad'; duracaoMin: number } | null = null
  for (const p of paradas) {
    if (p.classificacao !== 'FORA_BASE' || p.lat == null || p.lng == null) continue
    const duracaoMin = duracaoParadaMin(p)
    if (duracaoMin < DURACAO_MIN_PARADA_UNITRAC_PROPRIA_MIN) continue
    // Teto de duracao: parada de horas (almoco/pernoite) perto do cadastro
    // nao e' entrega -- FP RQQ5B81/2386225 23/09 era uma parada de 159 min.
    if (duracaoMin > DURACAO_MAX_COMPARTILHADA_VIZINHO_MIN) continue
    const distCad = cadastro ? haversine(p.lat, p.lng, cadastro.lat, cadastro.lng) : Infinity
    const distGeo = geoVerificado ? haversine(p.lat, p.lng, geoVerificado.lat, geoVerificado.lng) : Infinity
    const distM = Math.min(distCad, distGeo)
    if (distM > RAIO_COMPARTILHADA_VIZINHO_M) continue
    const temVizinho = outrosPontosDaPlaca
      .filter(o => o.endereco !== linha.endereco)
      .some(o => haversine(p.lat as number, p.lng as number, o.lat, o.lng) <= RAIO_OUTRO_CLIENTE_EXPLICA_M)
    if (!temVizinho) continue
    const ganha = !melhor || duracaoMin > melhor.duracaoMin
    if (ganha) melhor = { parada: p, distM, ref: distCad <= distGeo ? 'cad' : 'geo', duracaoMin }
  }
  return melhor ? { parada: melhor.parada, distM: melhor.distM, ref: melhor.ref } : null
}

function acharParadaProximaPropriaIsolada(
  linha: LinhaGeocodificada,
  cadastro: { lat: number; lng: number } | null,
  paradas: UnitracParadaRow[],
  outrosPontosDaPlaca: PontoReferenciaPlacaNf[],
  janelasProvaOutrasNfs: JanelaProvaOutraNf[],
  ponteComSinal: boolean,
): ParadaProvada | null {
  const geo = linha.geoConfiavel !== false && linha.lat != null && linha.lng != null
    ? { lat: linha.lat, lng: linha.lng }
    : null
  if (geo && cadastro && haversine(geo.lat, geo.lng, cadastro.lat, cadastro.lng) > DIVERGENCIA_GEO_CADASTRO_M) {
    cadastro = null
  }
  if (geo == null && cadastro == null) return null
  const outros = outrosPontosDaPlaca.filter(o => o.endereco !== linha.endereco)
  const janelasOutras = janelasProvaOutrasNfs.filter(j => j.endereco !== linha.endereco)
  const paradasPonte = paradas.filter(ehParadaDaPonte)
  let melhor: (ParadaProvada & { duracaoMin: number }) | null = null
  for (const p of paradas) {
    if (p.classificacao !== 'FORA_BASE' || p.lat == null || p.lng == null) continue
    const duracaoMin = duracaoParadaMin(p)
    if (duracaoMin < DURACAO_MIN_PARADA_PROXIMA_PROPRIA_MIN) continue
    if (ponteComSinal && !ehParadaDaPonte(p) && !paradasPonte.some(q =>
      q.classificacao === 'FORA_BASE' && sobrepoeNoTempo(p, q) && duracaoParadaMin(q) >= DURACAO_MIN_PARADA_PROXIMA_PROPRIA_MIN,
    )) continue
    const iniMs = new Date(p.chegada).getTime()
    const fimMs = fimParadaMs(p)
    if (janelasOutras.some(j => j.fimMs >= iniMs && j.iniMs <= fimMs)) continue
    const distGeo = geo ? haversine(p.lat, p.lng, geo.lat, geo.lng) : Infinity
    const distCad = cadastro ? haversine(p.lat, p.lng, cadastro.lat, cadastro.lng) : Infinity
    const distM = Math.min(distGeo, distCad)
    if (distM < RAIO_MIN_PARADA_PROXIMA_PROPRIA_M || distM > RAIO_MAX_PARADA_PROXIMA_PROPRIA_M) continue
    // Decisao 06/10 (usuario + tia Erica, "parada entre 500 m e 2 km vale como
    // entregue"): so' a parada NO endereco de outro cliente da placa (<= 150 m)
    // fica de fora. Antes tambem barrava "mais perto de outro cliente do que
    // deste" -- em rota densa isso barrava quase toda parada proxima.
    const explicadaPorOutro = outros.some(o =>
      haversine(p.lat as number, p.lng as number, o.lat, o.lng) <= RAIO_OUTRO_CLIENTE_EXPLICA_M)
    if (explicadaPorOutro) continue
    const ref: 'cad' | 'geo' = distCad < distGeo ? 'cad' : 'geo'
    if (ref === 'geo' && linha.geoSemFonte && duracaoMin < DURACAO_MIN_PARADA_PROXIMA_GEO_SEM_FONTE_MIN
      && !ehDesvioDedicado(p as ParadaComCoord, paradas)) continue
    const ganha = !melhor || distM < melhor.distM || (distM === melhor.distM && duracaoMin > melhor.duracaoMin)
    if (ganha) melhor = { parada: p, distM, ref, duracaoMin }
  }
  return melhor ? { parada: melhor.parada, distM: melhor.distM, ref: melhor.ref } : null
}

// Task 1 (plano 2026-09-29): rotulo neutro pra NF pendente de placa com
// apagao de sinal no dia (ver bloco em montarDetalheEntregas). Contem
// 'CONFERIR' -> calcularConfianca devolve 'REVISAR'.
export const SINAL_FALHA_LIGADO = false
const OBS_SINAL_RASTREADOR_FALHA = 'SINAL DO RASTREADOR COM FALHA NO DIA - CONFERIR'
// Rotulos de pendente que so' dizem "a posicao nao mostrou o caminhao perto"
// (sem evidencia POSITIVA de posicao) -- os unicos que o apagao de sinal
// (Task 1) e a placa com duas cargas (Task 2) podem trocar. `null` (SEM
// CONFIRMAÇÃO) e' tratado a' parte pelos chamadores.
const ROTULOS_SEM_EVIDENCIA_DE_POSICAO = [
  'PASSOU NO ENDEREÇO MAS NÃO REGISTROU PARADA - CONFERIR',
  'NÃO FOI AO CLIENTE',
] as const

// Task 1 (plano 2026-09-26): rotulos de "ENTREGUE com ressalva" que, com
// `modoPrecisao`, deixavam de contar como entregue -- viravam REVISAR (status
// pendente, horario preservado). Aplicado so' no FIM da cadeia (depois de R2
// e da escala divergente), pra R2 continuar enxergando os rotulos antigos
// na whitelist de elegivelParaConfirmarPorParadaPropria e poder resgatar a
// NF com parada forte da propria placa.
//
// Mudanca de regra por decisao do usuario (dono do produto), 26/09, Nutry
// Max: "precisao acima de cobertura" (Task 1, 26/09) gerou falso positivo
// na direcao contraria -- entregas com evidencia boa o bastante (parada
// curta cujo endereco e' o vencedor a <=150m; raio ampliado 500-800m; R2
// fraca 100-300m/2min-5min) estavam sumindo do numerador da taxa como
// REVISAR sem necessidade. So' 'PARADA COMPARTILHADA - REVISAR' (visita
// viaVizinhanca -- horario emprestado de OUTRO endereco, nao desta parada)
// continua exigindo conferencia -- as outras tres voltam a confirmar como
// 'ENTREGUE' (observacao null, status ja confirmado_gps antes deste bloco).
// Auditoria visual da Ana 03/10 (02/10, 28 NFs): as 11 'PARADA
// COMPARTILHADA - REVISAR' do dia eram entrega real (9 conferidas no mapa,
// 9 de 9 confirmadas). Pedido explicito dela: "permitir que uma mesma parada
// valide mais de uma NF quando os clientes/endereco forem compativeis". A
// compartilhada volta a CONFIRMAR com o rotulo de ressalva visivel (horario
// aproximado), sem rebaixar pra pendente -- EXCETO quando a Unitrac fechou o
// alvo com situacao 98 ("outro" desfecho, nao "feito"): os dois "nao foi"
// verificados de compartilhada (RQV9D97/2395585 Rede Loirinho 29/09,
// RBG2D21/2389318 Ilha Grande) tinham 98 e continuam REVISAR.
/** Rua + numero normalizados (sem complemento, AV=AVENIDA, R=RUA, espacos e
 *  zeros a esquerda) -- 06/10: notas do MESMO predio escritas diferente
 *  ("AV ..., 0126 - ... - BL 10" x "AVENIDA ..., 126") eram "outro cliente". */
export function chaveEndereco(endereco: string): string {
  const base = expandirTipoLogradouro(limparLixoInicio(endereco.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')))
    .split(' - ')[0]
  return base.replace(/\s+/g, ' ').replace(/,\s*0*(\d)/, ', $1').trim()
}

/** Mesmo cliente? Pelo codigo do cliente quando os dois tem; sem codigo, pela
 *  rua+numero normalizados. */
function mesmoClienteOuEndereco(a: { clienteCodigo?: string | null; endereco: string }, b: { clienteCodigo?: string | null; endereco: string }): boolean {
  const ca = a.clienteCodigo?.trim(), cb = b.clienteCodigo?.trim()
  if (ca && cb) return ca === cb
  return chaveEndereco(a.endereco) === chaveEndereco(b.endereco)
}

/** Endereco cujo ponto no mapa e' aproximado por natureza: estrada/rodovia,
 *  sem numero (S/N, SN, 0) ou ilha sem acesso rodoviario. Nesses, parada a
 *  km do nosso ponto nao prova que o caminhao nao foi (casos de 02/10 que a
 *  Ana validou como entregue: EST ESTREITO S/N, ROD MARIO COVAS SN, ESTRADA
 *  137, Ilha Grande). Rua urbana com numero nao entra (06/10, TOS0F89: parada
 *  no Centro "confirmando" Rio Comprido a 3,8 km). */
export function pontoAproximadoPorEndereco(endereco: string): boolean {
  if (acessoSomentePorBarco(endereco)) return true
  const e = endereco.toUpperCase().replace(/^\s*-?\s*/, '')
  if (/^(ROD|RODOVIA|EST|ESTR|ESTRADA|BR|RJ)\b/.test(e)) return true
  // Logradouro generico (06/10, gabarito 23-28/09: entregas reais na RUA
  // PROJETADA H, RUA PRINCIPAL, RUA C (LOT ...)) -- o mapa nao sabe onde fica.
  if (/^(R|RUA|AV|AVENIDA|TV|TRAVESSA)\.?\s+(PROJETADA|PRINCIPAL)\b/.test(e)) return true
  if (/^(R|RUA|AV|AVENIDA|TV|TRAVESSA)\.?\s+([A-Z]|\d+)\s*[,(]/.test(e)) return true
  const numero = e.match(/^[^,]*,\s*([^-]*?)\s*-/)?.[1]?.trim() ?? ''
  return numero === '' || /^(S\/?N|SN|0+)$/.test(numero)
}

// Ver bloco "Revisao de falso positivo 06/10" em montarDetalheEntregas.
const EVIDENCIAS_FRACAS_DE_PARADA = new Set<EvidenciaNf>(['raio_ampliado', 'vizinhanca', 'parada_curta_compartilhada'])
const DIST_MIN_PARADA_DE_OUTRO_CLIENTE_M = 400
const DIST_MAX_CONFIRMA_ROTA_ANDAMENTO_M = 300
const RAIO_PARADA_NO_PROPRIO_CLIENTE_M = 150
const EVIDENCIAS_FRACAS_PARADA_CURTA = new Set<EvidenciaNf>(['raio_ampliado', 'vizinhanca', 'parada_curta_compartilhada', 'parada_proxima_propria'])
const DURACAO_MAX_PARADA_CURTA_VARIOS_MIN = 5
export const OBS_PARADA_CURTA_VARIOS_LONGE = 'PARADA CURTA PARA VÁRIOS ENDEREÇOS A MAIS DE 500 M - CONFERIR'
const RAIO_CLIENTE_NA_BASE_M = 300
export const OBS_CLIENTE_NA_BASE = 'CLIENTE NA BASE - SÓ ESTADIA NA GARAGEM, SEM FEITO DA UNITRAC - CONFERIR'
export const OBS_PARADA_DE_OUTRO_CLIENTE = 'PARADA DE OUTRO CLIENTE - NÃO CONFIRMA ESTE CLIENTE - CONFERIR'

const REVISAR_POR_ROTULO_FRACO: Record<string, string> = {
  'ENTREGUE - PARADA COMPARTILHADA COM ENTREGA PRÓXIMA (horário aproximado)': 'PARADA COMPARTILHADA - REVISAR',
}
const SITUACAO_ALVO_OUTRO_DESFECHO = 98
// Rotulos de ressalva que, apesar do "CONFERIR" no texto original, decisao
// do usuario 26/09 trata como confirmacao plena -- a ressalva e' apagada
// (observacao null) em vez de virar REVISAR.
const CONFIRMAR_APESAR_DE_RESSALVA = new Set<string>([
  'ENTREGUE - PARADA PRÓXIMA (500-800m) MAS DENTRO DA ROTA - CONFERIR',
  'ENTREGUE - PARADA CURTA (ATÉ 3MIN) CONFIRMOU VÁRIOS ENDEREÇOS DIFERENTES AO MESMO TEMPO - CONFERIR',
])
// Ajuste 1 (decisao do controlador apos medir o custo em 22-25/09): visita
// da ponte ENTREGUE limpa NAO e' rebaixada por distParadaM > 300m -- a ponte
// ja' validou <=500m do ponto, e distParadaM vem do casamento por horario
// (acharCoordenadaDaParadaPropria), medida menos confiavel. R2 ja' tem teto
// proprio de 300m (RAIO_PARADA_UNITRAC_PROPRIA_M).

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
/** 09/10: romaneio sem coordenada nenhuma (geocode falhou, nem cadastro da Unitrac): ficava pendente em branco. */
export const OBS_ENDERECO_NAO_LOCALIZADO = 'ENDEREÇO NÃO LOCALIZADO - CONFERIR CADASTRO (não dá pra afirmar se foi ou não)'
function elegivelParaConfirmarPorParadaPropria(status: StatusEntrega, observacao: string | null): boolean {
  // Ja' e' ENTREGUE limpo (nenhuma ressalva, seja o status confirmado_unitrac
  // ou confirmado_gps) -- nada a fazer, ver caso de aceite (e).
  if (observacao == null) return status === 'pendente'
  return observacao === 'ENTREGUE - PARADA CURTA (ATÉ 3MIN) CONFIRMOU VÁRIOS ENDEREÇOS DIFERENTES AO MESMO TEMPO - CONFERIR'
    || observacao === 'ENTREGUE - PARADA PRÓXIMA (500-800m) MAS DENTRO DA ROTA - CONFERIR'
    || observacao === 'ENTREGUE - PARADA COMPARTILHADA COM ENTREGA PRÓXIMA (horário aproximado)'
    || observacao === 'PASSOU NO ENDEREÇO MAS NÃO REGISTROU PARADA - CONFERIR'
    || observacao === 'PARADA PRÓXIMA (500m-2km) MAS FORA DO ENDEREÇO - CONFERIR'
    || observacao === OBS_PASSOU_PERTO_SEM_PARAR
    || observacao === 'NÃO FOI AO CLIENTE (caminhão não esteve na região)'
    || observacao === 'PARADA CURTA DE OUTRO ENDEREÇO - NÃO CONFIRMA ESTE CLIENTE - CONFERIR'
    || observacao.startsWith(PREFIXO_OBS_COORDENADA_IMPRECISA)
    || observacao === OBS_ENDERECO_NAO_LOCALIZADO
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
  // Task 3 (plano 2026-10-03): status do rastreador declarado na ESCALA
  // (ex: "SEM RASTRI"). Quando presente e igual a "SEM RASTRI"
  // (case-insensitive, trimmed), a placa inteira é tratada como sem
  // rastreador independente de cv/ponte/GPS -- falha de infraestrutura
  // declarada no planejamento, não no dado. Todas as NFs da carga recebem
  // rótulo específico e saem do denominador da TAXA. Null/vazio = sem
  // declaração na escala, comportamento normal.
  statusRastreadorEscala: string | null = null,
): LinhaKpiRomaneio {
  // Task 3: SEM RASTRI na escala VENCE qualquer fonte de dado (mesmo
  // espírito de placasSemRastreador/placasSemSinal em placas-sem-rastreador.ts).
  const placaSemRastriNaEscala = statusRastreadorEscala != null
    && statusRastreadorEscala.trim().toUpperCase() === 'SEM RASTRI'
  if (placaSemRastriNaEscala) temRastreador = false
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

// Bug real 25/09 (Nutry Max, KPI-Nutry-Max-2026-09-25-TESTE.xlsx): a aba de
// resumo somava NF CONFIRMADAS (`paradasReais`, calculado acima em
// `agregarPorCarga`) = 1.987, mas as abas por placa (STATUS 'ENTREGUE',
// calculado por `montarDetalheEntregas`) somavam 2.073 -- diferença de 86
// NFs, todas confirmadas so' pelo RODIZIO DE CARGA INTEIRA (evidencia
// 'rota_outra_placa', Task 2 de 26/09) nas placas RQU2G47/RBJ2J67/TOS1H26.
// Causa raiz: `agregarPorCarga` decide `confirmadas` (linha 639-645 acima)
// SO' com `confirmadoUnitrac || confirmadoGps` -- nunca viu rodizio, R2
// (`confirmarPorParadaUnitracPropria`), parada curta/proxima confirmada
// nem nenhuma das outras regras que só existem dentro de
// `montarDetalheEntregas` (chamada DEPOIS de agregarPorCarga, route.ts/
// script). As duas fontes de verdade nunca podiam bater por construcao.
// Fix: `contarConfirmadasPorCarga` conta, a partir do `detalhe` (o mesmo
// array cujo `status` vira o rotulo 'ENTREGUE' nas abas por placa, ver
// LABEL_STATUS_ENTREGA em gerador-xlsx.ts), exatamente as mesmas NFs --
// `status !== 'pendente'` é o UNICO criterio, idêntico ao que
// `calcularResumoConfirmacao` (gerador-xlsx.ts) já usava pra taxa. O
// chamador (route.ts + gerar-nutrimax-real-arquivo.ts) usa este resultado
// pra SOBRESCREVER `paradasReais`/`status` de `agregarPorCarga` depois de
// montar `detalhe` -- nunca inventa uma segunda regra de confirmação, so'
// substitui a contagem simplificada pela contagem real. Rio Quality
// (pipeline.ts) nao chama esta funcao -- continua com o `paradasReais` de
// `agregarPorCarga` sozinho, comportamento intacto.
export function contarConfirmadasPorCarga(detalhe: LinhaDetalheEntrega[]): Map<string, number> {
  const porChave = new Map<string, number>()
  for (const d of detalhe) {
    if (d.status === 'pendente') continue
    const chave = `${d.carga}::${d.placa}`
    porChave.set(chave, (porChave.get(chave) ?? 0) + 1)
  }
  return porChave
}

/** Uma linha por NF (entrega) dentro da carga -- aba "Detalhamento" (pedido
 *  do usuário 24/08: além do resumo por carga, mostrar como ficou CADA
 *  entrega). Mesmo critério de confirmação de agregarPorCarga (alvo Unitrac
 *  OU Visita GPS), mas aqui por linha, não agregado. */
/** saidaCd/chegadaCd/tempoOperacaoMin/motorista vem da carga inteira (mesma
 *  LinhaKpiRomaneio ja calculada por agregarPorCarga pra esta carga+placa) --
 *  repetidos em toda linha de NF, pedido do usuario 25/08 (ver comentario de
 *  LinhaDetalheEntrega em types.ts). */
// Task 3 (plano 2026-09-26): mesma leitura de status/observacao que
// gerador-xlsx.ts ja faz pra taxa (ehSemRastreador/ehRevisar/ehAguardando),
// so' que devolvida como um veredito por NF em vez de agregada -- nunca uma
// regra nova, so' texto em cima do que agregacao.ts ja decidiu. Ver
// ConfiancaNf em types.ts pra precedencia comentada.
export function calcularConfianca(status: StatusEntrega, observacao: string | null): ConfiancaNf {
  if (status !== 'pendente') return 'CONFIRMADA'
  if (observacao == null) return 'NÃO CONFIRMADO'
  if (
    observacao.startsWith('SEM RASTREADOR')
    || observacao.startsWith('CARGA SEM PLACA')
    || observacao.startsWith('AGUARDANDO')
    || observacao.startsWith(OBS_NAO_SAIU_DA_BASE)
  ) {
    return 'SEM BASE'
  }
  // Fix round 1 (ruling do controlador 26/09): "VEÍCULO SEM MOVIMENTO..."
  // contem "CONFERIR" (regra generica abaixo pegaria REVISAR), mas nao e'
  // um sinal fraco que pede conferencia -- e' ausencia de evidencia (o
  // veiculo nao rodou o suficiente pra confirmar nada). Roda ANTES da regra
  // generica de proposito.
  if (observacao.startsWith('VEÍCULO SEM MOVIMENTO')) return 'NÃO CONFIRMADO'
  if (/REVISAR|CONFERIR|PASSOU/.test(observacao)) return 'REVISAR'
  return 'NÃO CONFIRMADO'
}

// Task 3: metros -> "42 m" (inteiro) ou "7,8 km" (1 casa decimal, PT-BR)
// acima de 1.000m -- unico formatador de distancia pro `motivo` (nunca
// duplica a formatacao de gerador-xlsx.ts, que mostra metros crus na coluna
// DIST. PARADA (m) -- `motivo` e' prosa, a coluna e' dado).
function formatarDistanciaMotivo(m: number): string {
  const arredondado = Math.round(m)
  if (arredondado >= 1000) {
    const km = Math.round(m / 100) / 10
    return `${km.toFixed(1).replace('.', ',')} km`
  }
  return `${arredondado} m`
}

// Task 3: minutos sempre inteiros na prosa (tempoParadaMin ja vem
// arredondado de minutosEntre, Math.round aqui e' so' defesa).
function formatarMinutosMotivo(min: number): string {
  return `${Math.round(min)} min`
}

/** Task 3 (plano 2026-09-26): frase em PT-BR resumindo o veredito de uma NF
 *  pra quem le o xlsx sem precisar decifrar EVIDÊNCIA + DIST. PARADA (m) +
 *  STATUS AUTOMÁTICO separadamente -- nunca uma fonte de verdade nova, so'
 *  narra o que `evidencia`/`distParadaM`/`tempoParadaMin`/`observacao`/
 *  `placaExecutora` ja decidiram. Ordem de precedencia: rotulos fixos de
 *  observacao primeiro (mais especificos que a evidencia crua), depois o
 *  "- REVISAR" generico do modoPrecisao (mesmo texto pra qualquer evidencia
 *  rebaixada), so' entao a evidencia caso nenhum dos anteriores bata. */
export function gerarMotivo(d: {
  status: StatusEntrega
  observacao: string | null
  evidencia: EvidenciaNf
  distParadaM: number | null
  tempoParadaMin: number | null
  placaExecutora?: string | null
}): string {
  const obs = d.observacao
  const dist = d.distParadaM != null ? formatarDistanciaMotivo(d.distParadaM) : null
  const min = d.tempoParadaMin != null ? formatarMinutosMotivo(d.tempoParadaMin) : null

  if (obs?.startsWith('CARGA SEM PLACA')) return 'Carga sem placa no romaneio — conferir com a operação'
  if (obs?.startsWith('SEM RASTREADOR')) return 'Placa sem rastreamento no dia'
  if (obs?.startsWith('AGUARDANDO')) return 'Rota ainda em andamento — aguardando fim do dia'
  if (obs?.startsWith('ENDEREÇO COM COORDENADA IMPRECISA')) {
    if (obs.includes('OUTRO MUNICÍPIO')) return 'Coordenada do cliente em outro município — conferir cadastro'
    if (obs.includes('OUTRO BAIRRO')) return 'Coordenada do cliente em outro bairro — conferir cadastro'
    return 'Coordenada do cliente imprecisa — conferir cadastro'
  }
  if (obs?.startsWith('ENDEREÇO NÃO LOCALIZADO')) return 'Endereço do romaneio não foi localizado no mapa — conferir cadastro'
  if (obs?.startsWith('CLIENTE SEM ACESSO RODOVIÁRIO')) return 'Cliente sem acesso rodoviário (ilha) — conferir com a operação'
  if (obs?.startsWith(OBS_NAO_SAIU_DA_BASE)) return 'Veículo não saiu da base no dia'
  if (obs?.startsWith('VEÍCULO SEM MOVIMENTO')) return 'Veículo sem movimento no dia — conferir rastreador'
  if (obs?.startsWith('PLACA DA ESCALA NÃO PASSOU')) return 'Placa da escala não passou no cliente — conferir escala'
  if (obs?.startsWith(PREFIXO_OBS_PAROU_COM_VIZINHO)) return 'Caminhão parou no endereço, mas a parada foi atribuída a um cliente vizinho — conferir'
  if (obs?.startsWith(PREFIXO_OBS_CADASTRO_DIVERGENTE)) return 'Cadastro do cliente na Unitrac diverge do endereço do romaneio — corrigir cadastro'
  if (obs?.startsWith(PREFIXO_OBS_PARADA_FORA_DO_ENDERECO)) return 'Entregue num local fora do bairro do endereço do romaneio — corrigir cadastro'
  if (obs?.startsWith('SINAL DO RASTREADOR COM FALHA')) return 'Sinal do rastreador com falha no dia — conferir'
  if (obs?.startsWith('PLACA COM DUAS CARGAS')) return 'Placa com duas cargas em regiões diferentes — conferir programação'
  if (obs?.startsWith('PARADA CURTA DE OUTRO ENDEREÇO')) {
    return dist
      ? `Parada curta confirmou outro endereço a ${dist} — não confirma este cliente`
      : 'Parada curta confirmou outro endereço — não confirma este cliente'
  }
  if (obs === OBS_PASSOU_PERTO_SEM_PARAR) {
    return dist ? `Passou a ${dist} do cliente sem parar — nenhuma parada a menos de 2 km` : 'Passou perto do cliente sem parar — nenhuma parada a menos de 2 km'
  }
  // Regras de conferencia de 06/10: a evidencia crua ("parada no endereco")
  // continuava saindo como "Entrega confirmada" com a NF pendente.
  if (obs === OBS_PARADA_DE_OUTRO_CLIENTE) {
    return min && dist
      ? `Parada de ${min} a ${dist} deste cliente, ao lado de outro cliente da placa — era a entrega do outro, conferir`
      : 'A parada foi no endereço de outro cliente da placa — conferir'
  }
  if (obs === OBS_PARADA_CURTA_VARIOS_LONGE) {
    return min
      ? `Uma parada curta (${min}) contada para vários endereços a mais de 500 m — conferir`
      : 'Uma parada curta contada para vários endereços a mais de 500 m — conferir'
  }
  if (obs?.startsWith('ENTREGUE POR OUTRA PLACA')) {
    const placaMatch = obs.match(/\(([^)]+)\)/)
    const placa = placaMatch ? placaMatch[1] : null
    if (placa && dist) return `Entregue pela placa ${placa} — carga transferida, a ${dist}`
    if (placa) return `Entregue pela placa ${placa} — carga transferida`
    return 'Entregue por outra placa — carga transferida'
  }
  if (obs?.startsWith('TEMPO EM LOJA ACIMA')) {
    return min && dist
      ? `Parada de ${min} a ${dist} do cliente — tempo em loja acima de 4h, conferir`
      : 'Tempo em loja acima de 4h — conferir'
  }

  // Task 1 (modoPrecisao): qualquer evidencia rebaixada pra "- REVISAR" leva
  // o MESMO texto generico -- a distincao fina (raio ampliado vs parada
  // curta vs R2 fraca) ja esta na coluna EVIDÊNCIA, o motivo so' resume "tem
  // sinal fraco, precisa olhar".
  if (obs != null && obs.endsWith('- REVISAR')) {
    if (min && dist) return `Parada de ${min} a ${dist} — revisar`
    if (dist) return `Parada a ${dist} — revisar`
    return 'Parada próxima — revisar'
  }

  if (d.evidencia === 'rota_outra_placa') {
    const placa = d.placaExecutora ?? '?'
    return min && dist ? `Rota executada pela ${placa} — parada de ${min} a ${dist}` : `Rota executada pela ${placa}`
  }
  if (d.evidencia === 'parada_proxima_propria') {
    return min && dist
      ? `Parada própria de ${min} a ${dist} do cliente, fora do endereço`
      : 'Parada própria próxima, fora do endereço'
  }
  if (d.evidencia === 'parada_unitrac_propria') {
    return min && dist ? `Parada Unitrac da própria placa de ${min} a ${dist}` : 'Parada Unitrac da própria placa'
  }
  if (
    d.evidencia === 'parada_no_endereco'
    || d.evidencia === 'raio_ampliado'
    || d.evidencia === 'vizinhanca'
    || d.evidencia === 'parada_curta_compartilhada'
  ) {
    return min && dist ? `Parada de ${min} a ${dist} do cliente` : 'Entrega confirmada no endereço do cliente'
  }
  if (d.evidencia === 'parada_no_cadastro_unitrac') {
    return min && dist ? `Parada de ${min} a ${dist} do cadastro Unitrac` : 'Entrega confirmada pelo cadastro Unitrac'
  }
  if (d.evidencia === 'alvo_feito_unitrac') {
    return min && dist
      ? `Parada de ${min} a ${dist} do cliente (confirmado pela Unitrac)`
      : 'Confirmado pela Unitrac, sem posição de GPS para medir distância'
  }
  if (d.evidencia === 'outra_placa') {
    return dist ? `Entrega confirmada por outra placa da frota — parada a ${dist}` : 'Entrega confirmada por outra placa da frota'
  }
  if (d.evidencia === 'passagem_sem_parada') {
    return dist ? `Caminhão passou a ${dist} sem parar` : 'Caminhão passou perto sem parar'
  }
  if (d.evidencia === 'parada_proxima_fora_raio') {
    return dist ? `Parada próxima a ${dist}, fora do raio do endereço — conferir` : 'Parada próxima fora do raio do endereço — conferir'
  }
  if (d.evidencia === 'sem_rastreador') return 'Placa sem rastreamento no dia'
  if (d.evidencia === 'sem_evidencia') {
    if (dist) return `Ponto mais próximo do trajeto a ${dist}`
    return d.status === 'pendente' ? 'Sem confirmação de entrega para este cliente' : 'Sem evidência registrada'
  }
  return 'Sem evidência de entrega para este cliente'
}

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
  // Task 2 (plano 2026-09-26, verificacao manual 24/09 -- caso real TTL5J17
  // 23-24/09): sinal da ponte de que a leitura de posicao desta placa ficou
  // ATRASADA (mesmo `apagaoDeSinal` de HorarioBase/base-horarios.ts, ja
  // usado por resolverParadas em unitrac.ts pra decidir Unitrac-vs-ponte) --
  // aqui reaproveitado como indicio de GPS CONGELADO (ultima posicao
  // conhecida repetida, nao permanencia real). Sozinho nao basta (apagao de
  // sinal tambem acontece com o veiculo se movendo entre leituras) -- so'
  // vira `gpsCongelado` combinado com "todas as paradas da PROPRIA placa no
  // mesmo ponto" (ver RAIO_GPS_CONGELADO_M abaixo), o que descarta o caso
  // (c) de aceite (placa genuinamente parada na base, GPS vivo, sem atraso
  // -- continua VEICULO SEM MOVIMENTO). Sem mudanca nenhuma na ponte: so'
  // repassa o campo que ja existe em HorarioBase.apagaoDeSinal. Default
  // false preserva Rio Quality e quem nao passar nada; Nutry Max (route.ts +
  // gerar-nutrimax-real-arquivo.ts) passa horarioBasePorPlaca.get(placaNorm)
  // ?.apagaoDeSinal ?? false. Mesmo padrao opt-in de tratarSemRastreadorNoDia
  // acima -- so' entra em jogo quando tratarSemRastreadorNoDia tambem esta
  // ligado (gate unico, ver `semRastreadorNoDia` abaixo).
  apagaoDeSinalPropriaPlaca: boolean = false,
  // Task 3 (plano 26/09, verificacao manual 24/09): NF -> menor distancia
  // (metros) do TRAJETO CONTINUO da propria placa ate' o ponto no dia
  // inteiro, independente de ter havido dwell/parada ali -- ver
  // comentario de `melhorDistanciaPropria` acima pro raciocinio completo
  // (por que `distanciaAteParadaPropria` sozinha nao pega passagem sem
  // parar). Task 3b (verificacao manual 26/09): a ponte (route.ts do
  // monitoramento) agora expoe esse dado (`VisitaPonto.menorDistanciaM`) --
  // este Map e' construido por `montarMenorDistanciaTrajetoPorNf`
  // (base-horarios.ts) a partir de `HorarioBase.visitasPorNf`, ja' passado
  // pelos dois chamadores de producao do fluxo Nutry Max (route.ts +
  // scripts/gerar-nutrimax-real-arquivo.ts). Default vazio preserva o
  // comportamento antigo pra quem nao passar nada (Rio Quality, pipeline.ts).
  menorDistanciaTrajetoPorNf: Map<string, number> = new Map(),
  // Task 4 (plano 26/09, verificacao manual 24/09 -- "na Nutry Max NAO
  // EXISTE troca de caminhao", decisao do usuario 26/09): quando a placa da
  // ESCALA nunca chegou perto de verdade da MAIORIA dos clientes da carga E
  // ha' sinal (nunca confirmacao -- ver existeParadaDeOutraPlacaComoSinal)
  // de que outro veiculo da frota parou perto deles, o problema mais
  // provavel e' a ESCALA/ROMANEIO terem posto a carga na placa errada, nao
  // o motorista ter faltado -- "NAO FOI AO CLIENTE" acusaria a placa
  // errada, e "ENTREGUE POR OUTRA PLACA" (que `desativarOutraPlaca` ja
  // proibe) inventaria uma troca que nao existe. As NFs elegiveis (ver
  // `elegivelParaEscalaDivergente`) saem `pendente` com rotulo proprio
  // pedindo conferencia da escala, sem horario (nenhuma das duas placas foi
  // confirmada pra ESTE cliente) -- ver `escalaDivergente`/
  // `elegivelParaEscalaDivergente` abaixo. Default false preserva Rio
  // Quality (pipeline.ts) e quem nao passar nada; Nutry Max (route.ts +
  // gerar-nutrimax-real-arquivo.ts) passa true.
  detectarEscalaDivergente: boolean = false,
  // Task 1 (plano 2026-09-26, especificacao da Ana 26/09: "90% de cobertura
  // com 99% de precisao e' melhor que 98% com falsos positivos") + mudanca
  // de regra por decisao do usuario 26/09 (mesmo dia, apos medir o custo em
  // producao): com `modoPrecisao` ligado, so' vizinhanca (horario emprestado
  // de OUTRO endereco) vira 'PARADA COMPARTILHADA - REVISAR' (`pendente`,
  // nao conta na taxa, mantem chegada/saida). Raio ampliado (500-800m),
  // parada curta compartilhada cujo endereco e' o vencedor (<=150m) e R2
  // fora do criterio forte (100-300m, 2-5min) voltam a CONFIRMAR como
  // ENTREGUE (ver CONFIRMAR_APESAR_DE_RESSALVA) -- so' a ressalva no texto
  // some, chegada/saida/evidencia continuam as mesmas. Mesmo padrao opt-in
  // dos anteriores: default false preserva Rio Quality (pipeline.ts) e quem
  // nao passar nada; Nutry Max (route.ts + gerar-nutrimax-real-arquivo.ts)
  // passa true.
  modoPrecisao: boolean = false,
  // Task 2 (plano 2026-09-26, rodizio de carga inteira): carga
  // `escalaDivergente` coberta (>=80% das NFs, parada >=2min a <=300m) por UM
  // unico outro veiculo da frota -> NFs com parada forte desse veiculo saem
  // confirmadas com STATUS 'ENTREGUE' (observacao null, mudanca de regra
  // 26/09 -- o texto 'ROTA EXECUTADA POR OUTRA PLACA (X)' nao pode mais
  // aparecer no xlsx da Nutry Max) / evidencia 'rota_outra_placa' /
  // placaExecutora=X (interno, ver comentario no bloco que atribui
  // observacao=null abaixo). Unica excecao a desativarOutraPlaca. So' tem
  // efeito com detectarEscalaDivergente ligado (e portanto nunca com
  // diaEmAndamento). Default false preserva Rio Quality (pipeline.ts);
  // Nutry Max (route.ts + gerar-nutrimax-real-arquivo.ts) passa true.
  reconhecerRodizio: boolean = false,
  // Item 3 (revisao final 26/09): a parada do EXECUTOR (placaRodizio) usada
  // pra confirmar uma NF nao pode ser, na verdade, a entrega de um cliente
  // do PROPRIO romaneio do executor naquele dia -- mesmo criterio de
  // `pontosReferenciaDaPlaca`/RAIO_OUTRO_CLIENTE_EXPLICA_M da R2 (<=150m de
  // outro endereco explica a parada sem confirmar este). So' geocode
  // confiavel (sem cadastro Unitrac do executor -- este parametro so' traz
  // `LinhaGeocodificada`, nao alvos, ver route.ts). Default vazio preserva
  // Rio Quality e quem nao passar nada; Nutry Max (route.ts + gerar-
  // nutrimax-real-arquivo.ts) passa `linhasPorPlaca` (TODAS as placas do
  // dia, ja calculado no chamador).
  linhasPorPlacaNoDia: Map<string, LinhaGeocodificada[]> = new Map(),
  // Task 3 (plano 2026-10-03): placa marcada "SEM RASTRI" na escala -> todas
  // as NFs dessa placa recebem rotulo especifico e sao excluidas do
  // denominador da TAXA. Diferente de `semRastreadorNoDia` (detectado por
  // GPS/ponte/declaracao manual), este e' declarado na propria escala
  // (infraestrutura, nao dado). Quando true, sobrepoe qualquer outra
  // classificacao e seta observacao='SEM RASTREADOR - PLACA SEM
  // RASTREAMENTO NA ESCALA - NÃO CONTABILIZADO'. Default false preserva
  // Rio Quality e comportamento antigo; Nutry Max (route.ts) passa true
  // quando escala.statusRastreador === 'SEM RASTRI'.
  placaSemRastriNaEscala: boolean = false,
  // Task 3 (plano 2026-09-30-rioquality-aprendizados): 'VEÍCULO NÃO SAIU DA
  // BASE' (km CONHECIDO baixo, fora da taxa) separado de `modoPrecisao` --
  // Rio Quality liga so' isto, sem o resto do modoPrecisao. Default = valor
  // de `modoPrecisao`: a Nutry Max (modoPrecisao=true, nao passa este
  // parametro) fica identica; quem nao passa nenhum dos dois, tambem.
  naoSaiuDaBase: boolean = modoPrecisao,
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
  // Item 1 (auditoria 30/09): cadastros Unitrac dos clientes da placa no dia,
  // pra achar cadastro identico ao de OUTRO cliente (codigo diferente).
  const cadastrosDaPlaca = todasLinhasDaPlacaNoDia.flatMap(l => {
    const a = alvoPorNf.get(l.nf)
    const c = cadastroDoAlvo(a)
    return a && c ? [{ codigo: a.codigoUnitrac, ...c }] : []
  })
  const cadastrosOutrosClientes = (codigo: string) => cadastrosDaPlaca.filter(c => c.codigo !== codigo)
  // A1 (revisao 30/09): uma parada so' preenche varias NFs do MESMO codigo de
  // cliente. Pre-passe: para cada NF da placa no DIA (todas as cargas) com baixa Unitrac (situacao 1 +
  // hora da baixa), a parada que acharParadaAntesDaBaixa escolheria; parada
  // SEM codigo reivindicada por >=2 codigos de cliente diferentes nao decide
  // de quem e' -> ninguem herda dela (Sonho x Coqueiro, mesmo cadastro).
  // Parada COM codigo ja' so' serve a quem ela lista (filtro na propria
  // acharParadaAntesDaBaixa), entao pode servir varios clientes listados.
  const paradasAntesDaBaixaCandidatas = (): UnitracParadaRow[] =>
    [...(paradasUnitracCruasPropriaPlaca.get(placaNorm) ?? []), ...(paradasPorOutraPlaca.get(placaNorm) ?? [])]
  const codigosPorParadaAntesDaBaixa = new Map<UnitracParadaRow, Set<string>>()
  // Achado real 02/10 (RQV6C75 Pacotao/Nilzieli/Bar da Marli): 3 clientes
  // vizinhos, cada um com cadastro PROPRIO a 18-119 m de uma parada de 33 min
  // -- a parada atendeu os tres. So' e' ambigua quando dois reivindicantes tem
  // o MESMO cadastro (Sonho x Coqueiro, <= RAIO_CADASTRO_IDENTICO_M).
  const cadastrosPorParadaAntesDaBaixa = new Map<UnitracParadaRow, { lat: number; lng: number }[]>()
  if (modoPrecisao) {
    for (const l of todasLinhasDaPlacaNoDia) {
      const a = alvoPorNf.get(l.nf)
      if (!a || a.situacao !== 1 || !a.feitoISO) continue
      const r = acharParadaAntesDaBaixa(l, a, paradasAntesDaBaixaCandidatas(), cadastrosOutrosClientes(a.codigoUnitrac))
      if (!r) continue
      const set = codigosPorParadaAntesDaBaixa.get(r.parada) ?? new Set<string>()
      if (!set.has(a.codigoUnitrac)) {
        const c = cadastroDoAlvo(a)
        if (c) cadastrosPorParadaAntesDaBaixa.set(r.parada, [...(cadastrosPorParadaAntesDaBaixa.get(r.parada) ?? []), c])
      }
      set.add(a.codigoUnitrac)
      codigosPorParadaAntesDaBaixa.set(r.parada, set)
    }
  }
  const paradaAntesDaBaixaDisputada = (p: UnitracParadaRow) => {
    if (codigosDeClienteDaParada(p).size !== 0 || (codigosPorParadaAntesDaBaixa.get(p)?.size ?? 0) <= 1) return false
    const cads = cadastrosPorParadaAntesDaBaixa.get(p) ?? []
    return cads.some((c, i) => cads.some((o, j) => j > i && haversine(c.lat, c.lng, o.lat, o.lng) <= RAIO_CADASTRO_IDENTICO_M))
  }
  // Guarda 1 da parada proxima propria (29/09, RQM0C38/2393499): o
  // isolamento conta TAMBEM vizinho com geocode nao confiavel (usa a
  // coordenada mesmo assim -- o Maycao, confiavel=false, estava a 33 m da
  // parada) e descarta parada cuja janela ja' e' prova de outra NF da placa no
  // dia (visita dela, ou alvo Unitrac feito dentro da janela).
  const pontosIsolamentoParadaProxima: PontoReferenciaPlacaNf[] = [
    ...pontosReferenciaDaPlaca,
    ...todasLinhasDaPlacaNoDia
      .filter(l => l.geoConfiavel === false && l.lat != null && l.lng != null)
      .map(l => ({ endereco: l.endereco, lat: l.lat as number, lng: l.lng as number })),
  ]
  const janelasProvaOutrasNfs: JanelaProvaOutraNf[] = todasLinhasDaPlacaNoDia.flatMap((l): JanelaProvaOutraNf[] => {
    const janelas: JanelaProvaOutraNf[] = []
    const v = visitasPorNf.get(l.nf)
    if (v) janelas.push({ endereco: l.endereco, iniMs: new Date(v.chegada).getTime(), fimMs: new Date(v.saida).getTime() })
    const a = alvoPorNf.get(l.nf)
    if (a?.situacao === 1 && a.feitoISO) {
      const ms = new Date(a.feitoISO).getTime()
      janelas.push({ endereco: l.endereco, iniMs: ms, fimMs: ms })
    }
    return janelas
  })
  // Task 4 (plano 26/09): decisao de nivel de CARGA (nao por NF) -- calculada
  // uma vez, usando o MESMO `melhorDistanciaPropria` ja usado abaixo pra
  // "NAO FOI"/"PASSOU" (mesma fonte de distancia, sem inventar uma segunda
  // nocao de "perto"). `linhasRomaneio` (so' desta carga+placa, nao
  // `todasLinhasDaPlacaNoDia`) e' o universo certo: a pergunta e' "essa
  // CARGA foi posta na placa certa", nao o dia inteiro da placa.
  const escalaDivergente = (() => {
    if (!detectarEscalaDivergente) return false
    // Achado real 26/09 (correcoes finais pre-deploy, item 1): com o dia
    // ainda em andamento, NFs que faltam visitar nao podem virar "CONFERIR
    // ESCALA" -- a placa da escala ainda pode chegar nelas. Sem este corte,
    // um relatorio gerado no meio do dia acusava a escala/romaneio antes da
    // rota terminar (mesmo espirito de `diaEmAndamento` no resto da funcao:
    // nenhum fato negativo e' declarado antes do dia realmente acabar pra
    // aquele veiculo). Ver uso de `nfEscalaDivergente` mais abaixo, que
    // agora nunca dispara com `diaEmAndamento` true.
    if (diaEmAndamento) return false
    if (linhasRomaneio.length < MIN_NFS_ESCALA_DIVERGENTE) return false
    let perto = 0
    let temSinalDeOutraPlaca = false
    for (const l of linhasRomaneio) {
      const dist = melhorDistanciaPropria(
        l, placaNorm, paradasPorOutraPlaca, paradasUnitracCruasPropriaPlaca,
        menorDistanciaTrajetoPorNf.get(l.nf) ?? null,
      )
      if (dist != null && dist <= RAIO_ESCALA_DIVERGENTE_PROPRIA_M) perto++
      if (!temSinalDeOutraPlaca && existeParadaDeOutraPlacaComoSinal(l, placaNorm, paradasPorOutraPlaca)) {
        temSinalDeOutraPlaca = true
      }
    }
    const proporcaoPerto = perto / linhasRomaneio.length
    return proporcaoPerto < PROPORCAO_MIN_ESCALA_DIVERGENTE && temSinalDeOutraPlaca
  })()
  // Task 2 (plano 26/09): paradas de cada veiculo candidato a executor --
  // resolvidas (ponte/Unitrac) + cruas da Unitrac, sem descartar nenhuma.
  function paradasDoVeiculo(placa: string): UnitracParadaRow[] {
    return [...(paradasPorOutraPlaca.get(placa) ?? []), ...(paradasUnitracCruasPropriaPlaca.get(placa) ?? [])]
  }
  const placaRodizio = (() => {
    if (!reconhecerRodizio || !escalaDivergente) return null
    const pontosPorNf = linhasRomaneio.map(l => pontosDaNf(l, alvoPorNf.get(l.nf)))
    const candidatas = new Set([...paradasPorOutraPlaca.keys(), ...paradasUnitracCruasPropriaPlaca.keys()])
    candidatas.delete(placaNorm)
    candidatas.delete('')
    const acimaDoLimiar: string[] = []
    for (const x of candidatas) {
      const paradasX = paradasDoVeiculo(x)
      const cobertas = pontosPorNf.filter(pts => acharParadaDoExecutor(pts, paradasX) != null).length
      if (cobertas / linhasRomaneio.length >= PROPORCAO_MIN_RODIZIO) acimaDoLimiar.push(x)
    }
    // Mais de um veiculo acima do limiar = ambiguo, nada muda.
    return acimaDoLimiar.length === 1 ? acimaDoLimiar[0] : null
  })()
  // Item 3 (revisao final 26/09): pontos de referencia dos clientes do
  // PROPRIO romaneio do executor no dia -- mesmo espirito de
  // `pontosReferenciaDaPlaca` (linha acima), so' que pra placaRodizio em vez
  // da placaNorm sendo processada. So' geocode confiavel (linhasPorPlacaNoDia
  // nao traz alvo/cadastro do executor, ver comentario do parametro).
  const pontosReferenciaDoExecutor: PontoReferenciaPlacaNf[] = placaRodizio
    ? (linhasPorPlacaNoDia.get(placaRodizio) ?? [])
      .filter((l): l is LinhaGeocodificada & { lat: number; lng: number } => l.geoConfiavel !== false && l.lat != null && l.lng != null)
      .map(l => ({ endereco: l.endereco, lat: l.lat, lng: l.lng }))
    : []
  const TETO_PERMANENCIA_RODIZIO_MIN = 240
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
      motivo: gerarMotivo({
        status: 'pendente',
        observacao: 'CARGA SEM PLACA NO ROMANEIO - CONFERIR COM A OPERAÇÃO',
        evidencia: 'sem_evidencia',
        distParadaM: null,
        tempoParadaMin: null,
      }),
      confianca: calcularConfianca('pendente', 'CARGA SEM PLACA NO ROMANEIO - CONFERIR COM A OPERAÇÃO'),
    }))
  }

  const resultado = linhasRomaneio.map((linha): LinhaDetalheEntrega => {
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
    // Task 2 (plano 26/09, caso (b) de aceite -- TTL5J17 GPS congelado o dia
    // todo com cv cadastrado, temRastreador ainda true): "congelado" e'
    // TODAS as paradas do dia da PROPRIA placa dentro do MESMO raio de 50m
    // (posicao nunca mudou de verdade) E a ponte sinalizou atraso de leitura
    // nessa janela (apagaoDeSinalPropriaPlaca) -- as duas condicoes juntas
    // descartam o caso (c) de aceite (parada real na base, GPS vivo: sem
    // atraso, `apagaoDeSinalPropriaPlaca` fica false e essa placa continua
    // caindo em `semMovimento` normalmente, abaixo).
    const RAIO_GPS_CONGELADO_M = 50
    const paradasComCoord = paradasProprias.filter((p): p is UnitracParadaRow & { lat: number; lng: number } => p.lat != null && p.lng != null)
    const todasParadasNoMesmoPonto = paradasComCoord.length > 0 && paradasComCoord.every(p =>
      haversine(paradasComCoord[0].lat, paradasComCoord[0].lng, p.lat, p.lng) <= RAIO_GPS_CONGELADO_M)
    const gpsCongelado = apagaoDeSinalPropriaPlaca && todasParadasNoMesmoPonto
    const semRastreadorNoDia = tratarSemRastreadorNoDia && (
      !temRastreador
      || (zeroPosicoesNoDia && !diaEmAndamento && !placaTemAlvoFeitoNoDia && !placaRodouPorKm)
      || gpsCongelado
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
      : melhorDistanciaPropria(
          linha, placaNorm, paradasPorOutraPlaca, paradasUnitracCruasPropriaPlaca,
          menorDistanciaTrajetoPorNf.get(linha.nf) ?? null,
        )
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

    // Task 2 (plano 26/09, caso (a) de aceite -- TTL5J17): placa SEM
    // RASTREADOR (`semRastreadorNoDia`, incl. o novo `gpsCongelado` acima) e'
    // um FATO JA CONHECIDO que nao pode ser desmentido por uma Visita/
    // paradaUnitracFeito -- a ponte pode devolver uma "visita" de GPS
    // congelado (posicao presa o dia inteiro) que, sem esta guarda, virava
    // `confirmadoGps`/'confirmado_gps' com chegada/saida 00:00-23:59 (~24h
    // de "tempo em loja", disparando LIMITE_TEMPO_LOJA_MIN em vez do rotulo
    // de sem rastreador). Excecao unica (mesmo espirito do bloco de
    // observacao/evidencia abaixo): `porOutraPlaca` e' evidencia POSITIVA
    // (outro veiculo da frota comprovadamente entregou) e continua vencendo
    // -- so' bloqueia quando NADA alem da propria placa confirmou.
    const bloqueiaHorarioSemRastreador = semRastreadorNoDia && !porOutraPlaca
    let status: StatusEntrega = confirmadoUnitrac
      ? 'confirmado_unitrac'
      : perdeuParadaCompartilhada
        ? 'pendente'
        : bloqueiaHorarioSemRastreador
          ? 'pendente'
          : confirmadoGps || porOutraPlaca
            ? 'confirmado_gps'
            : 'pendente'
    // Perdedor da parada compartilhada: a parada e' de OUTRO endereco do
    // grupo (o vencedor a <=150m) -- mostrar o horario dessa parada como se
    // fosse a chegada/saida DESTE cliente afirmaria uma presenca que a
    // equipe ja desmentiu (caso de aceite: "nao esteve no local"). Fica sem
    // horario, igual aos demais "pendente" sem evidencia propria. Mesma logica
    // pra `bloqueiaHorarioSemRastreador` (Task 2 acima).
    let chegada = perdeuParadaCompartilhada || bloqueiaHorarioSemRastreador
      ? null
      : visita?.chegada ?? paradaUnitracFeito?.parada.chegada ?? porOutraPlaca?.parada.chegada ?? null
    let saida = perdeuParadaCompartilhada || bloqueiaHorarioSemRastreador
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
    // Task 3 (plano 2026-10-03): placa marcada "SEM RASTRI" na escala ->
    // rotulo especifico, fora da taxa. Roda ANTES de semRastreadorNoDia
    // porque a declaracao na escala e' mais especifica (infraestrutura
    // declarada no planejamento, nao detectada por GPS/ponte). O label
    // NAO contem "OUTRA PLACA" nem "CARGA TRANSFERIDA" (global constraint).
    if (observacao == null && placaSemRastriNaEscala) {
      observacao = 'SEM RASTREADOR - PLACA SEM RASTREAMENTO NA ESCALA - NÃO CONTABILIZADO'
    }
    if (observacao == null && status === 'pendente' && semRastreadorNoDia) {
      observacao = 'SEM RASTREADOR - VEÍCULO SEM RASTREAMENTO NO DIA - NÃO CONTABILIZADO'
    }
    // Task 1 (plano 2026-09-29, medicao-28-09 secao 3 -- RQU6E83 parada o dia
    // todo, carga 98837 rodada pela RBI0J25): quando a carga ja' foi
    // reconhecida como rodizio (`placaRodizio` -- escalaDivergente + >=5 NFs +
    // UM unico veiculo cobrindo >=80%, mesmos criterios de sempre), o sintoma
    // "sem movimento" da placa da escala nao descreve a entrega: a NF segue
    // sem observacao e cai no bloco de rodizio/CONFERIR ESCALA mais abaixo
    // (parada forte do executor por NF, teto de 4h, descarte por cliente do
    // executor). Sem rodizio reconhecido, "sem movimento" continua igual.
    if (observacao == null && status === 'pendente' && semMovimento && !placaRodizio) {
      // 29/09 (pedido Ana/dono): so' modoPrecisao (Nutry Max) troca o texto e
      // tira a NF da taxa; Rio Quality/Porte Frio mantem o texto antigo.
      // Revisao final: 'nao saiu da base' (fora da taxa) so' com km CONHECIDO
      // do GPS continuo e baixo; km nulo (dia fora das 48h, paradas
      // incompletas) mantem o texto antigo, que CONTA na taxa. Placa com alvo
      // Unitrac 'feito' no dia OPEROU: irmas seguem a classificacao normal.
      const kmConhecidoBaixo = kmPercorrido != null
        && (kmPercorrido < LIMITE_KM_SEM_MOVIMENTO
          || (nuncaSaiuDaBase && kmPercorrido < LIMITE_KM_DESMENTE_NUNCA_SAIU_BASE))
      if (modoPrecisao && placaTemAlvoFeitoNoDia) {
        // operou: sem observacao, cai na classificacao normal abaixo
      } else {
        observacao = naoSaiuDaBase && kmConhecidoBaixo
          ? OBS_NAO_SAIU_DA_BASE
          : 'VEÍCULO SEM MOVIMENTO NO DIA - CONFERIR RASTREADOR OU SE SAIU PRA RUA'
      }
    }
    // Revisao final (item 1, plano 2026-09-26): com `modoPrecisao`, uma
    // visita FRACA (raio ampliado 500-800m, viaVizinhanca/horario emprestado,
    // ou parada curta compartilhada por varios enderecos) nao pode virar
    // "TEMPO EM LOJA ACIMA DE 4H - CONFERIR" confirmada so' por ficar >4h --
    // a fraqueza da EVIDENCIA tem precedencia sobre a duracao. Deixando
    // observacao em branco aqui, os blocos abaixo (parada curta/viaVizinhanca/
    // viaRaioAmpliado) atribuem o rotulo fraco correspondente, que o bloco
    // final de `modoPrecisao` (mais abaixo) ja' rebaixa pra "- REVISAR" e
    // `pendente`, preservando o horario. Sem `modoPrecisao` (Rio Quality),
    // comportamento intacto -- TEMPO EM LOJA continua vencendo sempre.
    const visitaFracaParaTempoEmLoja = modoPrecisao && visita != null && (
      visita.viaRaioAmpliado === true
      || visita.viaVizinhanca === true
      || (enderecosPorChaveDeParada.get(`${visita.chegada}|${visita.saida}`)?.size ?? 0) > 1
    )
    if (observacao == null && !visitaFracaParaTempoEmLoja && tempoParadaMin != null && tempoParadaMin > LIMITE_TEMPO_LOJA_MIN) {
      observacao = 'TEMPO EM LOJA ACIMA DE 4H - CONFERIR'
    }
    // Task 2 (caso de aceite RQQ5B81/NF 2386225, 23/09): roda ANTES do
    // rotulo generico de "CONFIRMOU VÁRIOS ENDEREÇOS" abaixo -- quando ha'
    // um vencedor claro (<=150m) no grupo, so' os enderecos genuinamente
    // longe (>300m) levam este rotulo; o vencedor cai no bloco seguinte
    // (mantem "ENTREGUE - PARADA CURTA..."), igual antes.
    //
    // Bug real 26/09 (segunda rodada, achado da Ana no KPI-Nutry-Max-
    // 2026-09-25-TESTE.xlsx): `status` ja' e' 'confirmado_unitrac' quando
    // `confirmadoUnitrac` e' true (ver ternario acima, que checa
    // confirmadoUnitrac ANTES de perdeuParadaCompartilhada) -- sem o guard
    // `status === 'pendente'` aqui, este bloco carimbava "...NÃO CONFIRMA
    // ESTE CLIENTE - CONFERIR" POR CIMA de uma NF que a Unitrac ja' tinha
    // confirmado por evidencia INDEPENDENTE (alvo.situacao===1), escondendo
    // o "ENTREGUE" no STATUS exibido (textoStatus em gerador-xlsx.ts mostra
    // a observacao quando ela existe) e quebrando a trava "STATUS comecando
    // com ENTREGUE == confirmado" (4 casos reais 25/09: RBJ9I44/2391211,
    // RQP0G77/2391713, RQU2E34/2391249, TOS4J82/2391148). A regra de
    // rebaixamento por parada curta de outro endereco so' faz sentido pra
    // decidir uma NF que AINDA nao tem confirmacao nenhuma -- nunca deve
    // rebaixar uma que a Unitrac ja' resolveu por conta propria.
    if (observacao == null && perdeuParadaCompartilhada && status === 'pendente') {
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
        // So' e' "parada" se o carro PAROU a ate' 2 km (geo ou cadastro);
        // senao foi so' passagem (06/10).
        const refs = [
          linha.lat != null && linha.lng != null ? { lat: linha.lat, lng: linha.lng } : null,
          alvo && coordValidaCadastro(alvo.pontoLat) && coordValidaCadastro(alvo.pontoLng) ? { lat: alvo.pontoLat as number, lng: alvo.pontoLng as number } : null,
        ].filter((r): r is { lat: number; lng: number } => r != null)
        const parouAte2km = [...paradasProprias, ...(paradasUnitracCruasPropriaPlaca.get(placaNorm) ?? [])].some(p =>
          p.classificacao === 'FORA_BASE' && p.lat != null && p.lng != null
          && refs.some(r => haversine(r.lat, r.lng, p.lat as number, p.lng as number) <= RAIO_NAO_FOI_AO_CLIENTE_M))
        observacao = parouAte2km || refs.length === 0 ? OBS_PARADA_PROXIMA_FORA : OBS_PASSOU_PERTO_SEM_PARAR
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
    // 09/10: pendente sem coordenada do romaneio (geocode falhou) ficava com
    // observacao em branco, sem explicar -- inclusive quando a Unitrac tem um
    // ponto, porque a distancia propria so' e' medida pelo geocode. Nao acusa
    // o motorista nem afirma nada -- so' aponta o cadastro; a parada propria
    // (R2, abaixo) ainda pode confirmar pelo ponto da Unitrac.
    if (observacao == null && status === 'pendente' && linha.lat == null) {
      observacao = OBS_ENDERECO_NAO_LOCALIZADO
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
    // Mudanca de regra por decisao do usuario 26/09: R2 fraca (achada mas
    // fora do criterio forte de modoPrecisao -- 100-300m com 2-5min) voltou
    // a CONFIRMAR (status confirmado_gps, observacao limpa) em vez de virar
    // REVISAR -- ver comentario de CONFIRMAR_APESAR_DE_RESSALVA acima pro
    // raciocinio completo. `preferirForte` (ultimo argumento de
    // acharParadaUnitracPropria, ainda `modoPrecisao`) continua preferindo a
    // candidata forte na ESCOLHA entre paradas candidatas -- so' o
    // desfecho pos-escolha deixou de rebaixar.
    if (confirmarPorParadaUnitracPropria && elegivelParaConfirmarPorParadaPropria(status, observacao)) {
      const cadastro = alvo && coordValidaCadastro(alvo.pontoLat) && coordValidaCadastro(alvo.pontoLng)
        ? { lat: alvo.pontoLat as number, lng: alvo.pontoLng as number }
        : null
      const achada = acharParadaUnitracPropria(
        linha, cadastro, paradasUnitracCruasPropriaPlaca.get(placaNorm) ?? [], pontosReferenciaDaPlaca, modoPrecisao,
        paradasProprias,
      )
      if (achada) {
        paradaPropriaConfirmada = achada
        status = 'confirmado_gps'
        chegada = achada.parada.chegada
        saida = achada.parada.fim_real ?? achada.parada.saida ?? achada.parada.chegada
        tempoParadaMin = chegada && saida ? minutosEntre(chegada, saida) : null
        observacao = null
      }
    }
    // Task 2 (plano 28/09): perdedor da parada curta compartilhada que a R2
    // (so' paradas cruas da Unitrac) nao resgatou -- procura tambem nas
    // paradas da PONTE da propria placa: >=3 min a <=300 m do cadastro/geocode
    // e nao explicada por outro cliente da placa a <=150 m. A parada curta que
    // o fez perder fica fora sozinha (>300 m dele, por definicao do perdedor).
    let paradaProvadaOutroEndereco: ParadaProvada | null = null
    if (
      confirmarPorParadaUnitracPropria && !paradaPropriaConfirmada && perdeuParadaCompartilhada
      && status === 'pendente' && observacao === OBS_PARADA_CURTA_OUTRO_ENDERECO
    ) {
      // Fix round 1 (FP real RQQ5B81/2386225 23/09): com cadastro Unitrac, a
      // distancia e' medida SO' contra ele (estudo 26/09, ranking 2: "a <=300
      // m do cadastro") -- o geocode entra so' quando nao ha' cadastro. O caso
      // real tinha parada da ponte a 23 m do geocode e a 4,2 km do cadastro.
      const cadastroNf = cadastroDoAlvo(alvo)
      paradaProvadaOutroEndereco = acharParadaPropriaProvada(
        cadastroNf ? { ...linha, geoConfiavel: false } : linha, cadastroNf,
        [...(paradasUnitracCruasPropriaPlaca.get(placaNorm) ?? []), ...paradasProprias],
        RAIO_PARADA_UNITRAC_PROPRIA_M, DURACAO_MIN_OUTRO_ENDERECO_PROVADO_MIN, pontosReferenciaDaPlaca,
      )
      if (paradaProvadaOutroEndereco) {
        const p = paradaProvadaOutroEndereco.parada
        status = 'confirmado_gps'
        observacao = null
        chegada = p.chegada
        saida = p.fim_real ?? p.saida ?? p.chegada
        tempoParadaMin = minutosEntre(chegada, saida)
      }
    }
    // Plano 29/09: PARADA PRÓXIMA (500m-2km) com parada propria >=3 min
    // isolada vira ENTREGUE com o horario dessa parada (ver
    // acharParadaProximaPropriaIsolada). So' `modoPrecisao` (Nutry Max); nunca
    // usa parada de outro veiculo (so' cruas + ponte da propria placa).
    let paradaProximaPropria: ParadaProvada | null = null
    if (modoPrecisao && status === 'pendente' && observacao === OBS_PARADA_PROXIMA_FORA) {
      // Guarda 3: "sinal" = a ponte (GPS bruto) respondeu por esta placa e nao
      // houve apagao -- ai' a duracao da Unitrac precisa bater no GPS. Em
      // apagao vale a duracao da Unitrac.
      const ponteComSinal = !apagaoDeSinalPropriaPlaca && paradasProprias.some(ehParadaDaPonte)
      paradaProximaPropria = acharParadaProximaPropriaIsolada(
        linha, cadastroDoAlvo(alvo),
        [...(paradasUnitracCruasPropriaPlaca.get(placaNorm) ?? []), ...paradasProprias],
        pontosIsolamentoParadaProxima, janelasProvaOutrasNfs, ponteComSinal,
      )
      if (paradaProximaPropria) {
        const p = paradaProximaPropria.parada
        status = 'confirmado_gps'
        observacao = OBS_ENTREGUE_PARADA_PROXIMA
        chegada = p.chegada
        saida = p.fim_real ?? p.saida ?? p.chegada
        tempoParadaMin = minutosEntre(chegada, saida)
      }
    }
    // Task 4 (plano 26/09): roda DEPOIS de R2 (paradaPropriaConfirmada acima)
    // de proposito -- se a PROPRIA placa acabou de ser confirmada por uma
    // parada real dela, nao ha' divergencia nenhuma pra esta NF especifica
    // (a carga pode continuar `escalaDivergente` pras OUTRAS NFs que a
    // propria placa realmente nao confirmou). `elegivelParaEscalaDivergente`
    // ja' garante status==='pendente' -- confirmado_unitrac/confirmado_gps/
    // porOutraPlaca (sempre null na Nutry Max, ver desativarOutraPlaca) nunca
    // chegam aqui. Roda ANTES de diaEmAndamento (abaixo): mesmo espirito de
    // semRastreadorNoDia/perdeuParadaCompartilhada -- "escala/romaneio
    // provavelmente errados" e' um fato ja' resolvido pelos dados de HOJE,
    // nao muda esperando o resto do dia.
    const nfEscalaDivergente = escalaDivergente && elegivelParaEscalaDivergente(status, observacao)
    // Task 2 (plano 26/09): rodizio de carga inteira -- NF que viraria
    // CONFERIR ESCALA e tem parada FORTE do veiculo executor vira confirmada.
    const paradaRodizioCandidata = nfEscalaDivergente && placaRodizio
      ? acharParadaDoExecutor(pontosDaNf(linha, alvo), paradasDoVeiculo(placaRodizio))
      : null
    // Item 3 (revisao final 26/09): descarta a candidata quando ela e', na
    // verdade, a parada de um cliente do PROPRIO executor (<=150m de outro
    // endereco do romaneio dele -- mesmo criterio de
    // RAIO_OUTRO_CLIENTE_EXPLICA_M da R2) ou quando a permanencia passa de
    // 4h (teto -- acima disso a "parada" ja nao parece uma entrega rapida do
    // rodizio, e sim outra coisa; NF fica CONFERIR ESCALA em vez de
    // confirmar por rodizio).
    const paradaRodizio = paradaRodizioCandidata && !(() => {
      const p = paradaRodizioCandidata.parada
      const explicadaPorClienteDoExecutor = p.lat != null && p.lng != null && pontosReferenciaDoExecutor
        .filter(o => o.endereco !== linha.endereco)
        .some(o => haversine(p.lat as number, p.lng as number, o.lat, o.lng) <= RAIO_OUTRO_CLIENTE_EXPLICA_M)
      const duracaoMin = (new Date(p.fim_real ?? p.saida ?? p.chegada).getTime() - new Date(p.chegada).getTime()) / 60_000
      return explicadaPorClienteDoExecutor || duracaoMin > TETO_PERMANENCIA_RODIZIO_MIN
    })()
      ? paradaRodizioCandidata
      : null
    const nfRodizio = paradaRodizio != null && paradaRodizio.forte
    if (nfRodizio && paradaRodizio) {
      status = 'confirmado_gps'
      // Mudanca de regra por decisao do usuario 26/09: o rotulo 'ROTA
      // EXECUTADA POR OUTRA PLACA (X)' deixa de existir no xlsx da Nutry
      // Max -- NF confirmada por rodizio sai com STATUS exatamente
      // 'ENTREGUE' (observacao null -> textoStatus em gerador-xlsx.ts cai no
      // LABEL_STATUS_ENTREGA generico). Evidencia interna ('rota_outra_placa',
      // ver bloco de EvidenciaNf abaixo) e' preservada -- so' o TEXTO exposto
      // no xlsx muda, nada de "OUTRA PLACA" pode aparecer la'.
      observacao = null
      chegada = paradaRodizio.parada.chegada
      saida = paradaRodizio.parada.fim_real ?? paradaRodizio.parada.saida ?? paradaRodizio.parada.chegada
      tempoParadaMin = minutosEntre(chegada, saida)
    } else if (nfEscalaDivergente) {
      observacao = 'PLACA DA ESCALA NÃO PASSOU NO CLIENTE - CONFERIR ESCALA'
      chegada = null
      saida = null
      tempoParadaMin = null
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
    // "aguardando". Task 4: escala divergente e' o mesmo tipo de fato ja'
    // resolvido.
    if (status === 'pendente' && diaEmAndamento && !semRastreadorNoDia && !perdeuParadaCompartilhada && !nfEscalaDivergente) {
      observacao = 'AGUARDANDO - ROTA EM ANDAMENTO, DIA AINDA NÃO FINALIZADO'
    }

    // Task 1 (plano 2026-09-29, caso real RQU4B93 28/09: 282 posicoes com
    // atraso >15 min, NFs 'PASSOU NO ENDEREÇO...' que a equipe confirma como
    // entregues): com a ponte sinalizando apagao de sinal da PROPRIA placa no
    // dia, a AUSENCIA de parada/posicao perto do cliente nao prova nada contra
    // o caminhao -- 'PASSOU', 'NÃO FOI' e o 'SEM CONFIRMAÇÃO' mudo viram um
    // rotulo neutro de conferencia. Continua pendente (dentro da taxa, nao
    // confirma), sem horario. Nao mexe em rotulos com evidencia de posicao
    // (PARADA PRÓXIMA, COORDENADA IMPRECISA) nem nos de precedencia maior
    // (SEM RASTREADOR, NÃO SAIU DA BASE, AGUARDANDO -- todos ja' atribuiram
    // `observacao` acima, fora da whitelist). So' `modoPrecisao` (Nutry Max).
    // DESLIGADO (29/09): medido em 22-28/09, 11 NFs que a equipe marcou 'nao foi'
    // viraram 'sinal com falha' porque a ponte marca apagao com UMA posicao
    // atrasada >15 min. Religar so' com criterio de apagao mais estrito.
    if (
      SINAL_FALHA_LIGADO && modoPrecisao && apagaoDeSinalPropriaPlaca && status === 'pendente'
      && (observacao == null || ROTULOS_SEM_EVIDENCIA_DE_POSICAO.some(r => observacao!.startsWith(r)))
    ) {
      observacao = OBS_SINAL_RASTREADOR_FALHA
      chegada = null
      saida = null
      tempoParadaMin = null
    }

    // Task 1 (plano 28/09): parada compartilhada que o bloco final de
    // `modoPrecisao` rebaixaria pra REVISAR -- com prova forte confirma. Status
    // ja' e' confirmado (unitrac ou gps) aqui; limpar a observacao basta pra
    // nao rebaixar. (b) parada propria vence (a): da' o horario real.
    // Auditoria Ana 03/10: parada unica atendendo esta NF e um cliente
    // vizinho da mesma placa (ver acharParadaCompartilhadaComVizinho).
    let paradaCompartilhadaVizinho: ParadaProvada | null = null
    if (
      modoPrecisao && confirmarPorParadaUnitracPropria && status === 'pendente'
      && elegivelParaConfirmarPorParadaPropria(status, observacao)
    ) {
      paradaCompartilhadaVizinho = acharParadaCompartilhadaComVizinho(
        linha, cadastroDoAlvo(alvo),
        [...(paradasUnitracCruasPropriaPlaca.get(placaNorm) ?? []), ...paradasProprias],
        pontosReferenciaDaPlaca,
      )
      if (paradaCompartilhadaVizinho) {
        const p = paradaCompartilhadaVizinho.parada
        status = 'confirmado_gps'
        observacao = OBS_COMPARTILHADA_VIZINHO
        chegada = p.chegada
        saida = p.fim_real ?? p.saida ?? p.chegada
        tempoParadaMin = minutosEntre(chegada, saida)
      }
    }
    let paradaProvada: ParadaProvada | null = paradaProvadaOutroEndereco ?? paradaProximaPropria ?? paradaCompartilhadaVizinho
    let paradaFeitoCompartilhada: { parada: UnitracParadaRow; distParadaM: number } | null = null
    if (modoPrecisao && observacao === OBS_COMPARTILHADA_APROXIMADA) {
      const cruasDaPlaca = paradasUnitracCruasPropriaPlaca.get(placaNorm) ?? []
      const provada = acharParadaPropriaProvada(
        linha, cadastroDoAlvo(alvo), [...cruasDaPlaca, ...paradasProprias],
        RAIO_COMPARTILHADA_PROVADA_M, DURACAO_MIN_COMPARTILHADA_PROVADA_MIN, null,
      )
      if (provada) {
        paradaProvada = provada
        observacao = null
        chegada = provada.parada.chegada
        saida = provada.parada.fim_real ?? provada.parada.saida ?? provada.parada.chegada
        tempoParadaMin = minutosEntre(chegada, saida)
      } else if (confirmadoUnitrac && alvo) {
        observacao = null
        paradaFeitoCompartilhada = acharParadaUnitracParaFeito(linha, alvo, cruasDaPlaca)
        if (paradaFeitoCompartilhada) {
          const p = paradaFeitoCompartilhada.parada
          chegada = p.chegada
          saida = p.fim_real ?? p.saida ?? p.chegada
          tempoParadaMin = minutosEntre(chegada, saida)
        }
      }
    }

    // Item 1 (auditoria 30/09): ENTREGUE so' pela baixa da Unitrac que
    // chegou ate' aqui sem horario (baixa em lote fora da janela da Task 10)
    // -- horario da parada da propria placa antes da baixa (ver
    // acharParadaAntesDaBaixa). Nao mexe em status. A2 (revisao 30/09):
    // nunca repoe horario apagado de proposito -- perdedora de parada
    // compartilhada (a equipe desmentiu a presenca) e placa sem rastreador
    // declarada/GPS congelado (bloqueiaHorarioSemRastreador).
    let paradaAntesDaBaixa: { parada: UnitracParadaRow; distParadaM: number } | null = null
    if (modoPrecisao && status === 'confirmado_unitrac' && chegada == null && alvo
      && !perdeuParadaCompartilhada && !bloqueiaHorarioSemRastreador) {
      paradaAntesDaBaixa = acharParadaAntesDaBaixa(
        linha, alvo,
        [...(paradasUnitracCruasPropriaPlaca.get(placaNorm) ?? []), ...paradasProprias],
        cadastrosOutrosClientes(alvo.codigoUnitrac),
      )
      if (paradaAntesDaBaixa && paradaAntesDaBaixaDisputada(paradaAntesDaBaixa.parada)) paradaAntesDaBaixa = null
      if (paradaAntesDaBaixa) {
        const p = paradaAntesDaBaixa.parada
        chegada = p.chegada
        saida = p.fim_real ?? p.saida ?? p.chegada
        tempoParadaMin = minutosEntre(chegada, saida)
      }
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
    if (nfRodizio && paradaRodizio) {
      evidencia = 'rota_outra_placa'
      distParadaM = Math.round(paradaRodizio.distM)
    } else if (paradaPropriaConfirmada) {
      evidencia = 'parada_unitrac_propria'
      distParadaM = Math.round(paradaPropriaConfirmada.distParadaM)
    } else if (paradaProvada && paradaProvada === paradaProximaPropria) {
      // Nao equipara a entrega no endereco (review 29/09).
      evidencia = 'parada_proxima_propria'
      distParadaM = Math.round(paradaProvada.distM)
    } else if (paradaProvada) {
      evidencia = paradaProvada.ref === 'cad' ? 'parada_no_cadastro_unitrac' : 'parada_no_endereco'
      distParadaM = Math.round(paradaProvada.distM)
    } else if (paradaAntesDaBaixa) {
      evidencia = 'alvo_feito_unitrac'
      distParadaM = Math.round(paradaAntesDaBaixa.distParadaM)
    } else if (paradaFeitoCompartilhada) {
      evidencia = 'alvo_feito_unitrac'
      distParadaM = Math.round(paradaFeitoCompartilhada.distParadaM)
    } else if (nfEscalaDivergente) {
      // Task 4: nem confirmacao nem "nao foi" -- a evidencia que temos e' de
      // que a ESCALA errou a placa, nao sobre esta entrega em si. Sem
      // distancia exposta de proposito (nao e' distancia da PROPRIA placa
      // que decidiu nada aqui, e' a parada de OUTRA placa, que nunca vira
      // numero no relatorio pra nao parecer confirmacao -- ver
      // existeParadaDeOutraPlacaComoSinal).
      evidencia = 'sem_evidencia'
    } else if (status === 'pendente' && semRastreadorNoDia) {
      evidencia = 'sem_rastreador'
    } else if (status === 'pendente' && observacao === OBS_NAO_SAIU_DA_BASE) {
      evidencia = 'nao_saiu_da_base'
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

    // Pedido da Ana 03/10 ("COORDENADA INCORRETA: separar como problema
    // cadastral, e nao simplesmente como entrega nao confirmada"; 6 das 9 NFs
    // de ERROS_CADASTRO 02/10 tinham o cadastro Unitrac a >1 km do endereco
    // do romaneio). Pendente sem prova com geocode confiavel e cadastro
    // divergente ganha rotulo proprio -- continua pendente e na taxa, so' o
    // diagnostico muda (vai pra aba Avisos pra corrigirem o cadastro).
    if (modoPrecisao && status === 'pendente' && ROTULOS_SEM_PROVA_CADASTRO.has(observacao ?? '')) {
      const cad = cadastroDoAlvo(alvo)
      if (cad && geoConfiavel && linha.lat != null && linha.lng != null) {
        const dist = haversine(linha.lat, linha.lng, cad.lat, cad.lng)
        if (dist > DIVERGENCIA_CADASTRO_ROMANEIO_M) {
          observacao = `${PREFIXO_OBS_CADASTRO_DIVERGENTE} (${(dist / 1000).toFixed(1).replace('.', ',')} km) - CONFERIR CADASTRO`
        }
      }
    }

    if (modoPrecisao && status === 'pendente' && observacao === 'PASSOU NO ENDEREÇO MAS NÃO REGISTROU PARADA - CONFERIR'
      && geoConfiavel && linha.lat != null && linha.lng != null) {
      let maisLongaMin = 0
      for (const p of [...(paradasUnitracCruasPropriaPlaca.get(placaNorm) ?? []), ...paradasProprias]) {
        if (p.classificacao !== 'FORA_BASE' || p.lat == null || p.lng == null) continue
        const dur = duracaoParadaMin(p)
        if (dur < DURACAO_MIN_PAROU_COM_VIZINHO_MIN) continue
        if (haversine(p.lat, p.lng, linha.lat, linha.lng) > RAIO_PAROU_COM_VIZINHO_M) continue
        maisLongaMin = Math.max(maisLongaMin, dur)
      }
      if (maisLongaMin > 0) {
        observacao = `${PREFIXO_OBS_PAROU_COM_VIZINHO} (${Math.round(maisLongaMin)} MIN) - CONFERIR`
      }
    }

    // Ao vivo 06/10 as 9h: 420 NFs "entregues" antes da entrega real -- a
    // parada a ate' 500 m de um VIZINHO confirmava clientes que o caminhao ainda
    // ia visitar (75% dessas a >300 m; das confirmacoes certas, 81% a <=150 m).
    // Com a rota em andamento, parada a mais de DIST_MAX_CONFIRMA_ROTA_ANDAMENTO_M
    // espera: se ele parar mais perto depois, confirma com o horario certo; no
    // fim do dia vale a regra de sempre (KPI final igual).
    // Regressao 06/10 (UNN6G81/PACIFIC): `distParadaM` vem do casamento por
    // horario (UMA parada, a de maior sobreposicao) e pegava outra parada da
    // janela a 541 m com o carro tendo parado a 9 m. Mede a MENOR distancia
    // entre o cliente (geocode/cadastro) e qualquer parada da propria placa na
    // janela da visita; sem parada achada, nao segura.
    const distMaisPerto = (soNaJanela: boolean): number | null => {
      if (!visita && soNaJanela) return null
      const ini = visita ? Date.parse(visita.chegada) : -Infinity, fim = visita ? Date.parse(visita.saida) : Infinity
      const proprios = [
        linha.geoConfiavel !== false && linha.lat != null && linha.lng != null ? { lat: linha.lat, lng: linha.lng } : null,
        alvo && coordValidaCadastro(alvo.pontoLat) && coordValidaCadastro(alvo.pontoLng) ? { lat: alvo.pontoLat as number, lng: alvo.pontoLng as number } : null,
      ].filter((p): p is { lat: number; lng: number } => p != null)
      let melhor: number | null = null
      for (const p of [...(paradasPorOutraPlaca.get(placaNorm) ?? []), ...(paradasUnitracCruasPropriaPlaca.get(placaNorm) ?? [])]) {
        if (p.classificacao !== 'FORA_BASE' || p.lat == null || p.lng == null) continue
        const pi = Date.parse(p.chegada), pf = Date.parse(p.fim_real ?? p.saida ?? p.chegada)
        if (soNaJanela && (pf < ini || pi > fim)) continue
        for (const q of proprios) {
          const dd = haversine(p.lat, p.lng, q.lat, q.lng)
          if (melhor == null || dd < melhor) melhor = dd
        }
      }
      return melhor
    }
    const distMaisPertoNaJanela = distMaisPerto(true)
    // Parada no proprio cliente em qualquer hora do dia (06/10: Cantinho Sabor
    // e Paulo S, carro parado a 24-25 m fora da janela da visita casada).
    const paradaNoClienteNoDia = (() => { const dd = distMaisPerto(false); return dd != null && dd <= RAIO_PARADA_NO_PROPRIO_CLIENTE_M })()
    if (modoPrecisao && diaEmAndamento && status === 'confirmado_gps' && distMaisPertoNaJanela != null
      && distMaisPertoNaJanela > DIST_MAX_CONFIRMA_ROTA_ANDAMENTO_M && !paradaNoClienteNoDia) {
      status = 'pendente'
      observacao = 'AGUARDANDO - ROTA EM ANDAMENTO, DIA AINDA NÃO FINALIZADO'
      chegada = null
      saida = null
      tempoParadaMin = null
    }
    // ORION REFEICOES (TTI6E49 07/10 e 08/10): cliente a 49 m da base da Penha
    // confirmado so' porque o caminhao ficou na garagem (parada de BASE de 95 min)
    // e a Unitrac nunca marcou feito. Estadia na base nao e' entrega: sem feito e
    // sem NENHUMA parada fora da base a <= RAIO_PARADA_NO_PROPRIO_CLIENTE_M do
    // cliente (geocode ou cadastro) no dia, nao confirma.
    // So' cliente a <= RAIO_CLIENTE_NA_BASE_M de uma base conhecida: a classificacao
    // "BASE" da Unitrac tambem aparece em hortifruti do pao em Tijuca (RQO9H37,
    // medido em 14 dias: ~10 NFs/dia derrubadas por engano).
    const pts = pontosDaNf(linha, alvo)
    const pertoDeBaseConhecida = pts.some(q => BASES_COORD_NUTRIMAX.some(b => haversine(q.lat, q.lng, b.lat, b.lng) <= RAIO_CLIENTE_NA_BASE_M))
    if (modoPrecisao && status === 'confirmado_gps' && visita && alvo?.situacao !== 1 && pertoDeBaseConhecida) {
      const doDia = [...(paradasPorOutraPlaca.get(placaNorm) ?? []), ...(paradasUnitracCruasPropriaPlaca.get(placaNorm) ?? [])]
        .filter(p => p.lat != null && p.lng != null)
      const perto = (p: UnitracParadaRow) => pts.some(q => haversine(p.lat as number, p.lng as number, q.lat, q.lng) <= RAIO_PARADA_NO_PROPRIO_CLIENTE_M)
      const ini = Date.parse(visita.chegada), fim = Date.parse(visita.saida)
      const naBaseNaJanela = doDia.some(p => p.classificacao === 'BASE' && perto(p) && Date.parse(p.fim_real ?? p.saida ?? p.chegada) >= ini && Date.parse(p.chegada) <= fim)
      if (naBaseNaJanela && !doDia.some(p => p.classificacao === 'FORA_BASE' && perto(p))) {
        status = 'pendente'
        observacao = OBS_CLIENTE_NA_BASE
        chegada = null
        saida = null
        tempoParadaMin = null
      }
    }
    // Ao vivo 08/10 (Erica, TTI6E49 Penha): horario do vizinho confirmou 3
    // clientes a 300-420 m de uma parada; a parada da Unitrac ainda nao tinha
    // chegado (atrasa), entao a regra acima nao media nada. Com a rota em
    // andamento, evidencia fraca so' confirma se o TRAJETO do carro (ponte, ao
    // vivo) passou a ate' RAIO_PARADA_NO_PROPRIO_CLIENTE_M do cliente; sem
    // trajeto nem parada medida, espera. Fim do dia: regra de sempre.
    const trajetoM = menorDistanciaTrajetoPorNf.get(linha.nf)
    if (modoPrecisao && diaEmAndamento && status === 'confirmado_gps' && EVIDENCIAS_FRACAS_DE_PARADA.has(evidencia) && !paradaNoClienteNoDia
      && ((trajetoM != null && trajetoM > RAIO_PARADA_NO_PROPRIO_CLIENTE_M) || (trajetoM == null && distMaisPertoNaJanela == null))) {
      status = 'pendente'
      observacao = 'AGUARDANDO - ROTA EM ANDAMENTO, DIA AINDA NÃO FINALIZADO'
      chegada = null
      saida = null
      tempoParadaMin = null
    }

    // Revisao de falso positivo 06/10 (TTM2G02, Botafogo: 1 parada no GALETO
    // SAT'S confirmou 9 outras NFs a 600-770 m por raio ampliado): evidencia
    // fraca (raio ampliado, horario do vizinho, parada curta compartilhada)
    // cuja parada real fica a <= RAIO_OUTRO_CLIENTE_EXPLICA_M de OUTRO cliente
    // da placa e a mais de DIST_MIN_PARADA_DE_OUTRO_CLIENTE_M desta NF (geocode
    // e cadastro) era a entrega do vizinho -- nao confirma esta.
    // So' com endereco de ponto preciso: no gabarito 23-28/09 as 6 entregas
    // reais que esta regra derrubaria eram todas de ponto aproximado.
    if (modoPrecisao && status === 'confirmado_gps' && visita && EVIDENCIAS_FRACAS_DE_PARADA.has(evidencia)
      && !pontoAproximadoPorEndereco(linha.endereco)) {
      const coord = acharCoordenadaDaParadaPropria(placaNorm, visita.chegada, visita.saida, paradasPorOutraPlaca, referenciaParaDesempate(linha, alvo))
      if (coord) {
        const proprios = [
          linha.geoConfiavel !== false && linha.lat != null && linha.lng != null ? { lat: linha.lat, lng: linha.lng } : null,
          alvo && coordValidaCadastro(alvo.pontoLat) && coordValidaCadastro(alvo.pontoLng) ? { lat: alvo.pontoLat as number, lng: alvo.pontoLng as number } : null,
        ].filter((p): p is { lat: number; lng: number } => p != null)
        const longeDestaNf = proprios.length > 0 && proprios.every(p => haversine(coord.lat, coord.lng, p.lat, p.lng) > DIST_MIN_PARADA_DE_OUTRO_CLIENTE_M)
        // "Outro cliente" pelo CODIGO do cliente, nao pelo texto do endereco:
        // shopping (Nova America) tem varias lojas na mesma rua+numero (gabarito
        // 24/09 GIGANTE NORDESTINO 'nao foi'), e o mesmo cliente aparece com o
        // endereco escrito diferente.
        const deOutroCliente = todasLinhasDaPlacaNoDia.some(l => mesmoClienteOuEndereco(l, linha) === false
          && pontosDaNf(l, alvoPorNf.get(l.nf)).some(o => haversine(coord.lat, coord.lng, o.lat, o.lng) <= RAIO_OUTRO_CLIENTE_EXPLICA_M))
        // NAO dispensa por "outra NF do mesmo endereco feita na Unitrac": no
        // gabarito da Ana (24/09, GIGANTE NORDESTINO, 'nao foi') o Shopping Nova
        // America tem varias lojas e a Unitrac fechar uma nao entrega as outras.
        // Sem dispensa por "parada perto na janela": em shopping (Nova America,
        // gabarito 24/09 GIGANTE NORDESTINO 'nao foi') o GPS nao separa as lojas.
        if (longeDestaNf && deOutroCliente) {
          status = 'pendente'
          if (diaEmAndamento) {
            observacao = 'AGUARDANDO - ROTA EM ANDAMENTO, DIA AINDA NÃO FINALIZADO'
            chegada = null
            saida = null
            tempoParadaMin = null
          } else {
            observacao = OBS_PARADA_DE_OUTRO_CLIENTE
          }
        }
      }
    }

    // Task 1 (plano 26/09) + mudanca de regra 26/09 (decisao do usuario):
    // roda depois de TUDO (R2, escala divergente, AGUARDANDO e evidencia).
    // So' 'PARADA COMPARTILHADA - REVISAR' (viaVizinhanca -- horario
    // emprestado de OUTRO endereco) continua rebaixando pra REVISAR; os
    // rotulos em CONFIRMAR_APESAR_DE_RESSALVA (parada curta vencedora, raio
    // ampliado 500-800m) tem a ressalva apagada e CONFIRMAM como ENTREGUE
    // (status ja e' confirmado_gps antes deste bloco, so' o texto sai).
    // Horario, evidencia e distancia ficam como estao nos dois casos
    // (informacao util pra conferir/registro, mesmo quando confirmado).
    if (modoPrecisao && observacao != null) {
      if (CONFIRMAR_APESAR_DE_RESSALVA.has(observacao)) {
        observacao = null
      } else {
        const revisar = REVISAR_POR_ROTULO_FRACO[observacao]
        // Achado 06/10 (TTH6G37, Centro): horario do vizinho com a parada real
        // a 500 m-2 km desta NF nao confirma -- regra da Ana (plano 03/10):
        // parada a 500 m-2 km nao vira entrega automatica. Acima de 2 km so'
        // fica como estava quando o nosso ponto e' aproximado por natureza
        // (ilha, estrada S/N -- os casos de 02/10 que a Ana validou como
        // entregue, ver pontoAproximadoPorEndereco). Distancia nao
        // medida (null) nao rebaixa: sem prova contra.
        // Distancia: a menor entre o cliente e as paradas da janela quando der
        // pra medir (o casamento por horario pega UMA parada e erra -- PACIFIC).
        const distVizinhanca = distMaisPertoNaJanela ?? distParadaM
        const paradaLongeDaNf = evidencia === 'vizinhanca' && distVizinhanca != null
          && distVizinhanca > RAIO_ENTREGA_METROS
          && (distVizinhanca <= RAIO_NAO_FOI_AO_CLIENTE_M || !pontoAproximadoPorEndereco(linha.endereco))
        if (revisar && (alvo?.situacao === SITUACAO_ALVO_OUTRO_DESFECHO || paradaLongeDaNf)) {
          status = 'pendente'
          observacao = revisar
          // Rota em andamento: o caminhao ainda pode passar no endereco --
          // nao acusa nem mostra o horario emprestado, so' espera (mesmo
          // espirito do AGUARDANDO acima).
          if (diaEmAndamento && alvo?.situacao !== SITUACAO_ALVO_OUTRO_DESFECHO) {
            observacao = 'AGUARDANDO - ROTA EM ANDAMENTO, DIA AINDA NÃO FINALIZADO'
            chegada = null
            saida = null
            tempoParadaMin = null
          }
        }
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
      evidencia,
      distParadaM,
      motivo: gerarMotivo({
        status,
        observacao,
        evidencia,
        distParadaM,
        tempoParadaMin,
        placaExecutora: nfRodizio ? placaRodizio : null,
      }),
      confianca: calcularConfianca(status, observacao),
      ...(nfRodizio ? { placaExecutora: placaRodizio } : {}),
    }
  })

  // Revisao 06/10 (TTY0J84: 1 parada de 4 min confirmou 4 clientes a 670-1090
  // m; RQV5F67: parada de 1 min confirmou 3 a 1-2 km): parada curta (<=
  // DURACAO_MAX_PARADA_CURTA_VARIOS_MIN) com evidencia fraca confirmando 2+
  // enderecos diferentes, todos a mais de RAIO_ENTREGA_METROS, nao confirma
  // nenhum -- nao da' tempo de entregar a pe' em varios lugares longe.
  if (modoPrecisao) {
    const grupos = new Map<string, LinhaDetalheEntrega[]>()
    for (const d of resultado) {
      if (d.status !== 'confirmado_gps' || !d.chegada || !EVIDENCIAS_FRACAS_PARADA_CURTA.has(d.evidencia)) continue
      if ((d.tempoParadaMin ?? 0) > DURACAO_MAX_PARADA_CURTA_VARIOS_MIN) continue
      const k = d.chegada.slice(0, 16)
      grupos.set(k, [...(grupos.get(k) ?? []), d])
    }
    const linhaPorNf = new Map(linhasRomaneio.map(l => [l.nf, l]))
    // Distancia medida da parada real ate' a NF (geocode/cadastro, o mais
    // perto); sem coordenada da parada, null -- nao da' pra provar longe.
    const distanciaReal = (d: LinhaDetalheEntrega): number | null => {
      if (d.distParadaM != null) return d.distParadaM
      const l = linhaPorNf.get(d.nf)
      if (!l || !d.chegada || !d.saida) return null
      const alvoL = alvoPorNf.get(d.nf)
      const ref = referenciaParaDesempate(l, alvoL)
      // Parada curta (1-4 min) costuma nao estar nas paradas da ponte -- tenta
      // tambem as paradas cruas da Unitrac da propria placa.
      const coord = acharCoordenadaDaParadaPropria(placaNorm, d.chegada, d.saida, paradasPorOutraPlaca, ref)
        ?? acharCoordenadaDaParadaPropria(placaNorm, d.chegada, d.saida, paradasUnitracCruasPropriaPlaca, ref)
      if (!coord) return null
      const { distGeo, distCad } = distanciasGeoECadastro(l, alvoL, coord)
      const ds = [distGeo, distCad].filter((x): x is number => x != null)
      return ds.length ? Math.min(...ds) : null
    }
    for (const g of grupos.values()) {
      const clientes = new Set(g.map(d => d.clienteCodigo?.trim() || chaveEndereco(d.endereco)))
      if (clientes.size < 2) continue
      if (!g.every(d => { const dist = distanciaReal(d); return dist != null && dist > RAIO_ENTREGA_METROS })) continue
      for (const d of g) {
        d.status = 'pendente'
        if (diaEmAndamento) {
          d.observacao = 'AGUARDANDO - ROTA EM ANDAMENTO, DIA AINDA NÃO FINALIZADO'
          d.chegada = null
          d.saida = null
          d.tempoParadaMin = null
        } else {
          d.observacao = OBS_PARADA_CURTA_VARIOS_LONGE
        }
        d.confianca = calcularConfianca(d.status, d.observacao)
        d.motivo = gerarMotivo({ status: d.status, observacao: d.observacao, evidencia: d.evidencia, distParadaM: d.distParadaM, tempoParadaMin: d.tempoParadaMin })
      }
    }
  }

  // Task 4 (plano 2026-10-03): inferencia temporal para SEM CONFIRMAÇÃO no
  // mesmo endereco. Quando uma NF esta pendente (sem evidencia de posicao) mas
  // outra NF no MESMO endereco (ou <=50m) foi confirmada com horario ±30min,
  // herda a confirmacao. Ganho estimado +0,4 pp na taxa. Roda DEPOIS da cadeia
  // por NF e ANTES de "duas cargas em regioes diferentes": precisa do desfecho
  // final das NFs desta carga, e rotulos de precedencia maior (SEM RASTREADOR,
  // NÃO SAIU DA BASE, AGUARDANDO, escala divergente) ja' ficaram fora da
  // whitelist de elegibilidade. So' `modoPrecisao` (Nutry Max), sem nova opcao
  // posicional -- mesmo padrao dos outros pos-processamentos.
  const JANELA_INFERENCIA_TEMPORAL_MIN = 30
  const DISTANCIA_MAX_INFERENCIA_M = 50
  const OBS_INFERENCIA_TEMPORAL = 'ENTREGUE - CONFIRMADO POR PROXIMIDADE TEMPORAL COM OUTRA NF NO MESMO ENDEREÇO'
  if (modoPrecisao) {
    // Agrupa NFs por endereco normalizado (mesma string exata do romaneio --
    // geocode ja' usou essa chave; enderecos distintos no texto sao entregas
    // distintas mesmo que o geocode tenha colapsado). So' grupos com >=1
    // ENTREGUE (confirmado_gps ou confirmado_unitrac) E >=1 pendente elegivel
    // produzem inferencia.
    const porEndereco = new Map<string, number[]>()
    for (let i = 0; i < resultado.length; i++) {
      const chave = resultado[i].endereco
      const arr = porEndereco.get(chave)
      if (arr) arr.push(i)
      else porEndereco.set(chave, [i])
    }
    for (const indices of porEndereco.values()) {
      if (indices.length < 2) continue
      const entregues: { idx: number; chegadaMs: number }[] = []
      const pendentes: number[] = []
      for (const i of indices) {
        const d = resultado[i]
        if (d.status === 'confirmado_gps' || d.status === 'confirmado_unitrac') {
          // Horario da entrega: chegada da visita GPS, ou feitoISO do alvo
          // Unitrac (quando confirmado so' por ele), ou null se nenhum dos
          // dois existir (caso raro de confirmado_unitrac sem horario -- nao
          // participa como ancora temporal).
          const linhaRef = linhasRomaneio[i]
          const visitaRef = visitasPorNf.get(linhaRef.nf)
          const alvoRef = alvoPorNf.get(linhaRef.nf)
          let chegadaMs: number | null = null
          if (visitaRef) {
            chegadaMs = new Date(visitaRef.chegada).getTime()
          } else if (alvoRef?.feitoISO) {
            chegadaMs = new Date(alvoRef.feitoISO).getTime()
          }
          if (chegadaMs != null) entregues.push({ idx: i, chegadaMs })
        } else if (d.status === 'pendente') {
          // Elegibilidade: NFs sem evidencia forte de posicao. Rotulos de
          // precedencia maior (SEM RASTREADOR, NÃO SAIU DA BASE, AGUARDANDO,
          // CONFERIR ESCALA, DUAS CARGAS) NUNCA sao sobrescritos. "PASSOU NO
          // ENDEREÇO MAS NÃO REGISTROU PARADA" E' elegivel porque indica que
          // o caminhao esteve la' mas a parada nao foi registrada -- exatamente
          // o cenario que a inferencia temporal resolve quando outra NF no
          // mesmo endereco confirma. observacao null tambem e' elegivel.
          if (d.observacao == null || d.evidencia === 'passagem_sem_parada') pendentes.push(i)
        }
      }
      if (entregues.length === 0 || pendentes.length === 0) continue
      for (const iPendente of pendentes) {
        const linhaPend = linhasRomaneio[iPendente]
        // A NF pendente precisa ter ALGUM horario estimado pra comparar --
        // sem coordenada propria nem parada proxima, nao ha' base temporal.
        // Usa a melhor estimativa disponivel: chegada/saida de parada da
        // propria placa perto do ponto (melhorDistanciaPropria ja mediu),
        // ou o centro da janela de uma visita por vizinhanca/raio ampliado.
        // Na pratica, a maioria dos "SEM CONFIRMAÇÃO" sem visita propria
        // ainda tem uma parada FORA_BASE da propria placa a poucos metros
        // (que nao confirmou por duracao/raio insuficientes) -- esse e' o
        // horario que importa aqui.
        let horarioEstimadoMs: number | null = null
        // Tenta achar parada da propria placa proxima ao ponto da NF pendente
        if (linhaPend.lat != null && linhaPend.lng != null) {
          const distParada = melhorDistanciaPropria(
            linhaPend, placaNorm, paradasPorOutraPlaca, paradasUnitracCruasPropriaPlaca,
            menorDistanciaTrajetoPorNf.get(linhaPend.nf) ?? null,
          )
          if (distParada != null && distParada <= DISTANCIA_MAX_INFERENCIA_M) {
            // Acha a parada mais proxima dentro do raio de inferencia
            const todasParadas = [...(paradasPorOutraPlaca.get(placaNorm) ?? []), ...(paradasUnitracCruasPropriaPlaca.get(placaNorm) ?? [])]
            let melhorParada: { ms: number; dist: number } | null = null
            for (const p of todasParadas) {
              if (p.classificacao !== 'FORA_BASE' || p.lat == null || p.lng == null) continue
              const dist = haversine(p.lat, p.lng, linhaPend.lat, linhaPend.lng)
              if (dist > DISTANCIA_MAX_INFERENCIA_M) continue
              const centroMs = (new Date(p.chegada).getTime() + new Date(p.fim_real ?? p.saida ?? p.chegada).getTime()) / 2
              if (!melhorParada || dist < melhorParada.dist) {
                melhorParada = { ms: centroMs, dist }
              }
            }
            if (melhorParada) horarioEstimadoMs = melhorParada.ms
          }
        }
        if (horarioEstimadoMs == null) continue
        // Compara contra TODAS as entregas confirmadas do grupo: basta UMA
        // dentro da janela de ±30min pra confirmar.
        const dentroDaJanela = entregues.some(e => Math.abs(horarioEstimadoMs! - e.chegadaMs) <= JANELA_INFERENCIA_TEMPORAL_MIN * 60_000)
        if (!dentroDaJanela) continue
        // Confirma por inferencia temporal
        const d = resultado[iPendente]
        resultado[iPendente] = {
          ...d,
          status: 'confirmado_gps',
          observacao: OBS_INFERENCIA_TEMPORAL,
          motivo: gerarMotivo({ status: 'confirmado_gps', observacao: OBS_INFERENCIA_TEMPORAL, evidencia: d.evidencia, distParadaM: d.distParadaM, tempoParadaMin: d.tempoParadaMin }),
          confianca: calcularConfianca('confirmado_gps', OBS_INFERENCIA_TEMPORAL),
        }
      }
    }
  }

  // Task 2 (plano 2026-09-29, caso real TOS5E38 28/09: carga 98861 Volta
  // Redonda 21 NFs/19 confirmadas + PAO-14 Niteroi 3 NFs, ~100 km dali, NF
  // 216155 'NÃO FOI'): quando a MESMA placa tem no dia uma carga principal
  // feita (>=10 NFs, >=50% confirmadas) e ESTA carga e' pequena, a >60 km da
  // principal, sem nenhuma NF confirmada e o trajeto da placa nunca chegou a
  // <=2 km de nenhum cliente dela, o problema provavel e' a PROGRAMACAO (duas
  // cargas incompativeis na mesma placa), nao o motorista. Troca so' os
  // rotulos sem evidencia de posicao (NÃO FOI / PASSOU / SEM CONFIRMAÇÃO);
  // continua pendente (dentro da taxa), sem horario. Roda DEPOIS da cadeia por
  // NF: precisa do desfecho final das NFs desta carga, e rotulos de
  // precedencia maior (SEM RASTREADOR, NÃO SAIU DA BASE, AGUARDANDO, SINAL DO
  // RASTREADOR da Task 1, CONFERIR ESCALA) ja' ficaram fora da whitelist. So'
  // `modoPrecisao` (Nutry Max), sem nova opcao posicional.
  if (modoPrecisao && placaComDuasCargasEmRegioesDiferentes(
    carga, placaNorm, linhasRomaneio, todasLinhasDaPlacaNoDia, alvoPorNf, visitasPorNf,
    paradasPorOutraPlaca, paradasUnitracCruasPropriaPlaca, menorDistanciaTrajetoPorNf, resultado,
  )) {
    return resultado.map(d => {
      if (d.status !== 'pendente') return d
      if (d.observacao != null && !ROTULOS_SEM_EVIDENCIA_DE_POSICAO.some(r => d.observacao!.startsWith(r))) return d
      const observacao = OBS_DUAS_CARGAS_REGIOES_DIFERENTES
      return {
        ...d,
        chegada: null,
        saida: null,
        tempoParadaMin: null,
        observacao,
        motivo: gerarMotivo({ status: d.status, observacao, evidencia: d.evidencia, distParadaM: d.distParadaM, tempoParadaMin: null }),
        confianca: calcularConfianca(d.status, observacao),
      }
    })
  }
  return resultado
}

// Task 2 (plano 2026-09-29): limiares da regra "placa com duas cargas em
// regioes diferentes" -- ver bloco no fim de montarDetalheEntregas.
export const OBS_DUAS_CARGAS_REGIOES_DIFERENTES = 'PLACA COM DUAS CARGAS EM REGIÕES DIFERENTES - CONFERIR PROGRAMAÇÃO'
const MIN_NFS_CARGA_PRINCIPAL = 10
const MAX_NFS_CARGA_SECUNDARIA = 5
const PROPORCAO_MIN_CONFIRMADAS_CARGA_PRINCIPAL = 0.5
const DISTANCIA_MIN_ENTRE_CARGAS_M = 60_000

function centroideConfiavel(linhas: LinhaGeocodificada[]): { lat: number; lng: number; n: number } | null {
  const ok = linhas.filter((l): l is LinhaGeocodificada & { lat: number; lng: number } =>
    l.geoConfiavel !== false && l.lat != null && l.lng != null)
  if (ok.length === 0) return null
  return {
    lat: ok.reduce((s, l) => s + l.lat, 0) / ok.length,
    lng: ok.reduce((s, l) => s + l.lng, 0) / ok.length,
    n: ok.length,
  }
}

function placaComDuasCargasEmRegioesDiferentes(
  carga: string,
  placaNorm: string,
  linhasRomaneio: LinhaGeocodificada[],
  todasLinhasDaPlacaNoDia: LinhaGeocodificada[],
  alvoPorNf: Map<string, AlvoApi>,
  visitasPorNf: Map<string, Visita>,
  paradasPorOutraPlaca: Map<string, UnitracParadaRow[]>,
  paradasUnitracCruasPropriaPlaca: Map<string, UnitracParadaRow[]>,
  menorDistanciaTrajetoPorNf: Map<string, number>,
  resultado: LinhaDetalheEntrega[],
): boolean {
  if (placaNorm.trim() === '') return false
  // Carga secundaria (esta): pequena e sem NENHUMA NF confirmada no desfecho final.
  if (linhasRomaneio.length === 0 || linhasRomaneio.length > MAX_NFS_CARGA_SECUNDARIA) return false
  if (resultado.some(d => d.status !== 'pendente')) return false
  const centroSecundaria = centroideConfiavel(linhasRomaneio)
  if (!centroSecundaria) return false
  // Trajeto da placa: distancia conhecida a pelo menos um cliente desta carga
  // e NENHUM a <=2 km (mesmo limiar de 'NÃO FOI AO CLIENTE').
  const distancias = linhasRomaneio
    .filter(l => l.geoConfiavel !== false)
    .map(l => melhorDistanciaPropria(l, placaNorm, paradasPorOutraPlaca, paradasUnitracCruasPropriaPlaca, menorDistanciaTrajetoPorNf.get(l.nf) ?? null))
    .filter((d): d is number => d != null)
  if (distancias.length === 0 || distancias.some(d => d <= RAIO_NAO_FOI_AO_CLIENTE_M)) return false
  // Carga principal: outra carga da mesma placa no dia, grande, com geocode
  // confiavel na maioria das NFs, >=50% confirmadas (alvo Unitrac feito ou
  // visita GPS -- mesma base de confirmacao da cadeia por NF) e com centroide
  // a >60 km desta.
  const nfsDestaCarga = new Set(linhasRomaneio.map(l => l.nf))
  const porCarga = new Map<string, LinhaGeocodificada[]>()
  for (const l of todasLinhasDaPlacaNoDia) {
    if (l.carga === carga || nfsDestaCarga.has(l.nf)) continue
    const arr = porCarga.get(l.carga)
    if (arr) arr.push(l)
    else porCarga.set(l.carga, [l])
  }
  for (const linhasPrincipal of porCarga.values()) {
    if (linhasPrincipal.length < MIN_NFS_CARGA_PRINCIPAL || linhasPrincipal.length <= linhasRomaneio.length) continue
    const centro = centroideConfiavel(linhasPrincipal)
    if (!centro || centro.n < linhasPrincipal.length / 2) continue
    const confirmadas = linhasPrincipal.filter(l => alvoPorNf.get(l.nf)?.situacao === 1 || visitasPorNf.has(l.nf)).length
    if (confirmadas / linhasPrincipal.length < PROPORCAO_MIN_CONFIRMADAS_CARGA_PRINCIPAL) continue
    if (haversine(centro.lat, centro.lng, centroSecundaria.lat, centroSecundaria.lng) > DISTANCIA_MIN_ENTRE_CARGAS_M) return true
  }
  return false
}
