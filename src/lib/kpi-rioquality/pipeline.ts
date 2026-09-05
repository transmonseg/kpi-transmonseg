import { normPlaca, buscarStopsCru, consolidaParadasApi } from '@/lib/unitrac-api'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import { agregarPorCarga, montarDetalheEntregas } from '@/lib/kpi-romaneio/agregacao'
import { montarVisitasInclusivas } from './visitas'
import { BASES_COORD_RIOQUALITY } from './constants'
// calcularKmPercorrido (soma da reta entre paradas) NAO e' usado aqui de
// proposito -- subestima 43% a 65%. Ver km-rastro.ts.
import { calcularKmPorRastro } from './km-rastro'
import { gerarKpiRomaneioXlsx } from '@/lib/kpi-romaneio/gerador-xlsx'
import type { LinhaGeocodificada, LinhaKpiRomaneio, LinhaDetalheEntrega, Visita } from '@/lib/kpi-romaneio/types'
import { parseCustos, parseEntregas, montarLinhasRomaneio, rotaParaZona, parseEntregasCompletas, montarLinhasRomaneioCompleto } from './parse-planilhas'
import { geocodificarPorCoerencia, type ConfiancaCoerencia } from './geocode-coerencia'
import { geocodificarEnderecos } from '@/lib/kpi-romaneio/geocode'

// Nucleo do KPI Rio Quality -- usado pela rota /api/kpi/rioquality/gerar e
// pelo script scripts/gerar-rioquality-real-arquivo.ts (mesma pipeline, sem
// HTTP/auth). Ver docs/plans/2026-09-05-kpi-rio-quality.md.
//
// Diferencas pro pipeline da Nutry Max (kpi-romaneio):
//   - entrada = 2 planilhas (placa+rota, placa+rua); sem escala, sem NF, sem cidade;
//   - geocodificacao pela ponte de COERENCIA DE GRUPO, com confianca por parada;
//   - presenca so' por GPS (paradas da Unitrac por CV) -- sem alvos/geofences
//     da Unitrac de proposito (marcacoes proprias a partir do romaneio);
//   - casamento INCLUSIVO entrega x parada + vizinhanca (./visitas.ts): varias
//     entregas na mesma rua/coordenada confirmam com a mesma parada;
//   - base/CD descoberta pelo GPS (./constants.ts): saida/chegada do CD e km
//     saem do fallback por eventos BASE de agregarPorCarga.

export const OBS_POR_CONFIANCA: Partial<Record<ConfiancaCoerencia, string>> = {
  baixa: 'LOCALIZAÇÃO INCERTA (RUA SEM CIDADE NO ROMANEIO) - CONFERIR',
  isolado: 'LOCALIZAÇÃO INCERTA (RUA SEM CIDADE NO ROMANEIO) - CONFERIR',
  sem_candidato: 'ENDEREÇO NÃO LOCALIZADO (RUA SEM CIDADE NO ROMANEIO)',
}

export type ResultadoPipelineRioQuality = {
  xlsx: Buffer
  linhasKpi: LinhaKpiRomaneio[]
  detalhe: LinhaDetalheEntrega[]
  estatisticas: {
    entregas: number
    placas: number
    placasComCv: number
    confianca: Record<ConfiancaCoerencia, number>
    status: Record<string, number>
  }
}

export class EntradaInvalidaError extends Error {}

function agrupar<T>(itens: T[], chave: (item: T) => string): Map<string, T[]> {
  const mapa = new Map<string, T[]>()
  for (const item of itens) {
    const k = chave(item)
    const arr = mapa.get(k)
    if (arr) arr.push(item)
    else mapa.set(k, [item])
  }
  return mapa
}

export async function gerarKpiRioQuality(params: {
  // Formato ANTIGO (duas planilhas, sem cidade -- coerencia de grupo).
  custosBuf?: Buffer
  entregasBuf?: Buffer
  // Formato NOVO, achado real 06/09: um UNICO arquivo, ja' com cidade/bairro/
  // cliente/motorista -- cascata PRECISA de geocodificacao (mesma da Nutry
  // Max), sem precisar de coerencia de grupo. Ver parse-planilhas.ts.
  completaBuf?: Buffer
  data: string
  cvPorPlaca: Map<string, string>
  /** injetavel pra teste; padrao = Unitrac stops (48h) sem base cadastrada */
  buscarParadas?: (cv: string, placaNorm: string, data: string) => Promise<UnitracParadaRow[]>
  log?: (msg: string) => void
}): Promise<ResultadoPipelineRioQuality> {
  const { custosBuf, entregasBuf, completaBuf, data, cvPorPlaca } = params
  const log = params.log ?? (() => {})
  const buscarParadas =
    params.buscarParadas ??
    (async (cv: string, placaNorm: string, d: string) =>
      // base propria da Rio Quality (descoberta pelo GPS, ver constants.ts) --
      // NAO usar buscarParadasDoDia, que classifica pelas bases da Nutry Max
      consolidaParadasApi(await buscarStopsCru(cv, 48), {}, d, placaNorm, BASES_COORD_RIOQUALITY))

  // 1) parse + 2) geocodificacao -- dois formatos de entrada, mesma saida
  // (romaneioGeo: LinhaGeocodificada[], confiancaPorNf, contConf).
  const confiancaPorNf = new Map<string, ConfiancaCoerencia>()
  const contConf: Record<ConfiancaCoerencia, number> = { alta: 0, media: 0, baixa: 0, sem_candidato: 0, isolado: 0 }
  const romaneioGeo: LinhaGeocodificada[] = []
  const formatoCompleto = completaBuf != null

  if (completaBuf) {
    const entregasCompletas = parseEntregasCompletas(completaBuf)
    if (entregasCompletas.length === 0) {
      throw new EntradaInvalidaError(
        'Nenhuma linha reconhecida no arquivo — confira se tem as colunas Razão Social, Cidade, UF, Destino, Motorista, Placa, Endereço e Bairro.',
      )
    }
    const { linhas: romaneio, enderecoBrutoPorNf } = montarLinhasRomaneioCompleto(entregasCompletas)
    log(`Entregas: ${romaneio.length} linhas (arquivo unico, com cidade)`)
    // cascata PRECISA (rua+bairro+cidade+UF descarta rua homonima em
    // municipio errado sozinha, sem precisar de ancora de outra parada) --
    // so' devolve lat/lng, sem nivel de confianca proprio: 'alta' quando
    // achou, 'sem_candidato' quando nao (mesmo criterio da Nutry Max).
    const enderecosUnicos = [...new Set(romaneio.map(l => enderecoBrutoPorNf.get(l.nf)!))]
    const resultados = await geocodificarEnderecos(enderecosUnicos)
    const geoPorEndereco = new Map(enderecosUnicos.map((e, i) => [e, resultados[i]]))
    for (const l of romaneio) {
      const r = geoPorEndereco.get(enderecoBrutoPorNf.get(l.nf)!) ?? null
      const conf: ConfiancaCoerencia = r ? 'alta' : 'sem_candidato'
      confiancaPorNf.set(l.nf, conf)
      contConf[conf]++
      romaneioGeo.push({ ...l, lat: r?.lat ?? null, lng: r?.lng ?? null })
    }
  } else {
    if (!custosBuf || !entregasBuf) {
      throw new EntradaInvalidaError('Faltam as planilhas: Relatório de Custos e Relatório de Entregas (ou o arquivo único novo).')
    }
    const custos = parseCustos(custosBuf)
    const entregas = parseEntregas(entregasBuf)
    if (entregas.length === 0) {
      throw new EntradaInvalidaError(
        'Nenhuma linha reconhecida no Relatório de Entregas — confira se é a planilha "Relatório de Entregas" da Rio Quality (colunas Placa e Endereço).',
      )
    }
    const romaneio = montarLinhasRomaneio(custos, entregas)
    log(`Custos: ${custos.size} placas com rota; Entregas: ${entregas.length} linhas`)

    // geocodificacao por coerencia: um grupo por placa, zona pela rota
    const linhasPorPlaca = agrupar(romaneio, l => normPlaca(l.placa))
    const placasNormGeo = [...linhasPorPlaca.keys()]
    const grupos = placasNormGeo.map(placaNorm => ({
      id: placaNorm,
      zona: rotaParaZona(custos.get(placaNorm) ?? null),
      ruas: (linhasPorPlaca.get(placaNorm) ?? []).map(l => l.endereco),
    }))
    const geo = await geocodificarPorCoerencia(grupos)

    for (const placaNorm of placasNormGeo) {
      const linhas = linhasPorPlaca.get(placaNorm) ?? []
      const res = geo.get(placaNorm) ?? []
      linhas.forEach((l, i) => {
        const r = res[i]
        const conf = r?.confianca ?? 'sem_candidato'
        confiancaPorNf.set(l.nf, conf)
        contConf[conf]++
        romaneioGeo.push({ ...l, lat: r?.lat ?? null, lng: r?.lng ?? null, pontosAlternativos: r?.pontosZona ?? [] })
      })
    }
  }
  log(`Geocodificacao: ${JSON.stringify(contConf)}`)
  const placasNorm = [...new Set(romaneioGeo.map(l => normPlaca(l.placa)))]
  const linhasGeoPorPlaca = agrupar(romaneioGeo, l => normPlaca(l.placa))

  // 3) GPS do dia por CV
  const paradasPorPlaca = new Map<string, UnitracParadaRow[]>()
  const visitasPorPlaca = new Map<string, Map<string, Visita>>()
  const kmPorPlaca = new Map<string, number | null>()
  const temRastreadorPorPlaca = new Map(placasNorm.map(p => [p, cvPorPlaca.has(p)]))
  await Promise.all(placasNorm.map(async placaNorm => {
    const cv = cvPorPlaca.get(placaNorm)
    const paradas = cv ? await buscarParadas(cv, placaNorm, data) : []
    paradasPorPlaca.set(placaNorm, paradas)
    visitasPorPlaca.set(placaNorm, montarVisitasInclusivas(linhasGeoPorPlaca.get(placaNorm) ?? [], paradas))
    kmPorPlaca.set(placaNorm, cv ? await calcularKmPorRastro(cv, data) : null)
  }))
  log(`Placas: ${placasNorm.length}, com CV: ${placasNorm.filter(p => cvPorPlaca.has(p)).length}`)

  // 4) agregacao por carga (= rota) x placa -- sem escala, sem alvos
  const cargasPorChave = agrupar(romaneioGeo, l => `${l.carga}::${normPlaca(l.placa)}`)
  const linhasKpi: LinhaKpiRomaneio[] = [...cargasPorChave.entries()]
    .map(([chave, linhasDaCarga]) => {
      const [carga, placaNorm] = chave.split('::')
      return agregarPorCarga(
        carga,
        placaNorm,
        linhasDaCarga,
        null,
        [],
        visitasPorPlaca.get(placaNorm) ?? new Map(),
        paradasPorPlaca.get(placaNorm) ?? [],
        kmPorPlaca.get(placaNorm) ?? null,
        undefined,
        temRastreadorPorPlaca.get(placaNorm) ?? false,
      )
    })
    .sort((a, b) => a.carga.localeCompare(b.carga) || a.placa.localeCompare(b.placa))
  const resumoPorChave = new Map(linhasKpi.map(l => [`${l.carga}::${l.placa}`, l]))

  const contStatus: Record<string, number> = {}
  const detalhe: LinhaDetalheEntrega[] = [...cargasPorChave.entries()]
    .flatMap(([chave, linhasDaCarga]) => {
      const [carga, placaNorm] = chave.split('::')
      const resumo = resumoPorChave.get(chave)
      return montarDetalheEntregas(
        carga,
        placaNorm,
        linhasDaCarga,
        [],
        visitasPorPlaca.get(placaNorm) ?? new Map(),
        {
          motorista: resumo?.motorista ?? '',
          saidaCd: resumo?.saidaCd ?? null,
          chegadaCd: resumo?.chegadaCd ?? null,
          tempoOperacaoMin: resumo?.tempoOperacaoMin ?? null,
        },
        temRastreadorPorPlaca.get(placaNorm) ?? false,
        // So' as paradas da PROPRIA placa: a heuristica "MUDOU DE ROTA" (casa
        // pendente com GPS de OUTRA placa) foi feita pra Nutry Max; na Rio
        // Quality -- 100 caminhoes na mesma regiao, rua sem numero -- disparou
        // em ~400 entregas na primeira geracao real (05/09), puro ruido.
        new Map([[placaNorm, paradasPorPlaca.get(placaNorm) ?? []]]),
        resumo?.kmPercorrido ?? null,
      )
    })
    // confianca da geocodificacao vira observacao -- so' quando pendente (se o
    // GPS confirmou, a coordenada estava boa o bastante) e sem sobrescrever
    // observacao mais grave ja' posta por montarDetalheEntregas
    .map(d => {
      contStatus[d.status] = (contStatus[d.status] ?? 0) + 1
      if (d.observacao) return d
      // confirmada pela faixa ampliada (500-800m): sai marcada, nunca como
      // confirmacao normal -- romaneio sem numero, coordenada e' de trecho de
      // rua (achado 05/09, ver kpi-rioquality/visitas.ts)
      const visita = visitasPorPlaca.get(normPlaca(d.placa))?.get(d.nf)
      if (visita?.viaRaioAmpliado) {
        return { ...d, observacao: 'ENTREGUE - PARADA A ATÉ 800M DO ENDEREÇO (romaneio sem número, horário aproximado)' }
      }
      // confirmada em OUTRO trecho da mesma rua (rua comprida, o CNEFE tem
      // varios pontos): sai marcada, mesma logica da faixa ampliada acima
      if (visita?.viaOutroPontoDaRua) {
        return { ...d, observacao: 'ENTREGUE - PARADA EM OUTRO TRECHO DA MESMA RUA (romaneio sem número, horário aproximado)' }
      }
      if (d.status !== 'pendente') return d
      const conf = confiancaPorNf.get(d.nf) ?? 'sem_candidato'
      // formato novo (com cidade): "sem_candidato" e' geocode que falhou
      // MESMO com cidade -- mensagem diferente da coerencia de grupo (rua
      // sem cidade no romaneio), que nao se aplica aqui.
      const obs = formatoCompleto
        ? (conf === 'sem_candidato' ? 'ENDEREÇO NÃO LOCALIZADO' : undefined)
        : OBS_POR_CONFIANCA[conf]
      return obs ? { ...d, observacao: obs } : d
    })
    .sort((a, b) => a.carga.localeCompare(b.carga) || a.placa.localeCompare(b.placa) || a.nf.localeCompare(b.nf))
  log(`Status: ${JSON.stringify(contStatus)}`)

  const xlsx = await gerarKpiRomaneioXlsx(linhasKpi, data, [], detalhe, undefined, 'RIO QUALITY')
  return {
    xlsx,
    linhasKpi,
    detalhe,
    estatisticas: {
      entregas: romaneioGeo.length,
      placas: placasNorm.length,
      placasComCv: placasNorm.filter(p => cvPorPlaca.has(p)).length,
      confianca: contConf,
      status: contStatus,
    },
  }
}
