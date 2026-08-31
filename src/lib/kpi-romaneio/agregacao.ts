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

/** Acha, pra uma NF sem confirmação nenhuma pela placa escalada, se OUTRA
 *  placa da frota passou perto do mesmo ponto no dia -- sinal de troca de
 *  carro na hora da entrega (pedido do usuário 25/08, nível Benassi --
 *  mesmo espírito de sugestao-troca.ts dela). Usa o mesmo raio de
 *  confirmação por perímetro próprio (RAIO_ENTREGA_METROS), nunca o raio
 *  que a Unitrac cadastra pro alvo. */
function acharPlacaSuspeita(
  linha: LinhaGeocodificada,
  placaEsperada: string,
  paradasPorOutraPlaca: Map<string, UnitracParadaRow[]>,
): string | null {
  if (linha.lat == null || linha.lng == null) return null
  for (const [outraPlaca, paradas] of paradasPorOutraPlaca) {
    if (outraPlaca === placaEsperada) continue
    const achou = paradas.some(p =>
      p.classificacao === 'FORA_BASE' && p.lat != null && p.lng != null &&
      haversine(p.lat, p.lng, linha.lat as number, linha.lng as number) <= RAIO_ENTREGA_METROS,
    )
    if (achou) return outraPlaca
  }
  return null
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
): LinhaDetalheEntrega[] {
  const alvoPorNf = new Map(alvos.filter(a => a.documento).map(a => [a.documento as string, a]))

  return linhasRomaneio.map((linha): LinhaDetalheEntrega => {
    const alvo = alvoPorNf.get(linha.nf)
    const visita = visitasPorNf.get(linha.nf)
    const confirmadoUnitrac = alvo?.situacao === 1
    const confirmadoGps = visita != null
    const status: StatusEntrega = confirmadoUnitrac
      ? 'confirmado_unitrac'
      : confirmadoGps
        ? 'confirmado_gps'
        : 'pendente'
    const tempoParadaMin = visita ? minutosEntre(visita.chegada, visita.saida) : null

    let observacao: string | null = null
    if (status === 'pendente') {
      const placaSuspeita = acharPlacaSuspeita(linha, placaNorm, paradasPorOutraPlaca)
      if (placaSuspeita) observacao = `MUDOU DE ROTA - CONFERIR (placa provável: ${placaSuspeita})`
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
      chegada: visita?.chegada ?? null,
      saida: visita?.saida ?? null,
      tempoParadaMin,
      status,
      temRastreador,
      observacao,
    }
  })
}
