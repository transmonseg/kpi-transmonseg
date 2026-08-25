import type { AlvoApi } from '@/lib/unitrac-api'
// UnitracParadaRow vem de matcher.ts, não de unitrac-api -- mesma ressalva
// de unitrac.ts (Task 6).
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import type { LinhaEscala, LinhaGeocodificada, LinhaKpiRomaneio, LinhaDetalheEntrega, StatusEntrega, Visita } from './types'

function minutosEntre(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000)
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
  kmPercorrido: number | null,
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
  const saidaCd = primeiraBase ? (primeiraBase.fim_real ?? primeiraBase.saida) : null
  const chegadaCd = ultimaBase ? ultimaBase.chegada : null

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
      tempoParadaMin: visita ? minutosEntre(visita.chegada, visita.saida) : null,
      status,
    }
  })
}
