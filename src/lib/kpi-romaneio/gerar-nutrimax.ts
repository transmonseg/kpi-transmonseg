// Calculo do KPI da Nutry Max a partir dos dados ja' lidos (escala, romaneio,
// pao) -- UNICO codigo usado pela rota /api/kpi/nutrimax/gerar, pelo script
// de regeracao e pelo KPI ao vivo (spec 2026-10-06-kpi-ao-vivo-design.md).
// Movido da rota em 06/10 sem mudanca de comportamento: a rota e' a referencia.
import { buscarFrota, normPlaca } from '@/lib/unitrac-api'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import { hojeBR } from '@/lib/data-br'
import { geocodificarEnderecosComInfo } from '@/lib/kpi-romaneio/geocode'
import { reposicionarPorAncoras } from '@/lib/kpi-romaneio/geocode-ancoras'
import { chaveCacheEndereco, enderecosColididosPorCoordenada } from '@/lib/kpi-romaneio/endereco-cep'
import { buscarAlvosDoDia, buscarParadasDoDia, resolverParadas } from '@/lib/kpi-romaneio/unitrac'
import { anexarCoordenadaCadastro, montarMenorDistanciaTrajetoPorNf, consumirFalhasPonte } from '@/lib/kpi-romaneio/base-horarios'
import { ajustarChegadaAposUltimaEntrega } from '@/lib/kpi-romaneio/fim-rota'
import { alvosDaData } from '@/lib/kpi-romaneio/alvos-data'
import { alvosEfetivos } from '@/lib/kpi-romaneio/alvos-snapshot'
import { paradasEfetivas } from '@/lib/kpi-romaneio/paradas-snapshot'
import { detectarDescasamentos, detectarMotoristaMultiplasPlacas, detectarCargaMultiRegiao } from '@/lib/kpi-romaneio/avisos'
import { montarVisitas } from '@/lib/kpi-romaneio/visitas'
import { agregarPorCarga, montarDetalheEntregas, calcularDiaEmAndamento, contarConfirmadasPorCarga } from '@/lib/kpi-romaneio/agregacao'
import { calcularKmPercorrido } from '@/lib/kpi-romaneio/km'
import { gerarKpiRomaneioXlsx, cargasEscalaDivergenteInteira } from '@/lib/kpi-romaneio/gerador-xlsx'
import { detectarTrocasProvaveis } from '@/lib/kpi-romaneio/troca-placa'
import { aplicarTrocasDePlaca, buscarTrocasDoDia } from '@/lib/kpi-romaneio/trocas-placa'
import { aplicarLocaisClientes, buscarLocaisClientes } from '@/lib/kpi-romaneio/locais-clientes'
import { lerCacheDia, gravarCacheDia } from '@/lib/kpi-romaneio/cache-dia'
import { COD_USER_NUTRIMAX, EMPRESA_NUTRIMAX, foraDoAlcanceApi, LIMITE_CONCORRENCIA_PLACAS, PAO_PREFIXO } from '@/lib/kpi-romaneio/constants'
import { mapComLimite } from '@/lib/kpi-romaneio/concorrencia'
import { buscarResolucoes, aplicarResolucoes } from '@/lib/kpi-romaneio/resolucoes'
import { conferirParadaForaDoEndereco, verificarTerritorioNaPonte } from '@/lib/kpi-romaneio/parada-fora-do-endereco'
import { resolverAliasPlacas, buscarHorariosBaseComAlias, montarCvPorPlaca, aplicarAliasEmConjunto, placasAliasDaFrota } from '@/lib/kpi-romaneio/alias-placa'
import { buscarPlacasSemRastreador, placasSemRastreadorNoDia, montarTemRastreadorPorPlaca, placasSemSinalComTrava } from '@/lib/kpi-romaneio/placas-sem-rastreador'
import { logarNfDuplicadaNaMesmaPlaca } from '@/lib/kpi-romaneio/nf-duplicada'
import type { LinhaGeocodificada, LinhaKpiRomaneio, LinhaDetalheEntrega, Visita } from '@/lib/kpi-romaneio/types'
import type { LinhaEscala, LinhaRomaneio, AvisoDescasamento } from '@/lib/kpi-romaneio/types'
import type { ResultadoGeocode } from '@/lib/kpi-romaneio/geocode'

const FONTES_VERIFICADAS = new Set(['manual', 'verificacao_manual', 'cadastro_unitrac'])
const CLIENTE_LOCAIS = 'nutrimax'

// Fix 12/09 (Finding 8): `motivo` chega da ponte HTTP/cache como `string`
// solto (ResultadoGeocode em geocode.ts) -- narrow explicito pro union real
// de LinhaGeocodificada['geoMotivo'] em vez de crashar o build ou usar `as`
// as cegas. Qualquer valor fora dos dois conhecidos vira undefined (mesmo
// fail-open do resto do arquivo: motivo desconhecido nao sustenta rotulo).
export function narrowGeoMotivo(motivo: string | undefined): 'municipio_divergente' | 'bairro_divergente' | undefined {
  return motivo === 'municipio_divergente' || motivo === 'bairro_divergente' ? motivo : undefined
}

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

/** Entrada invalida pra gerar (ex.: romaneio principal sem nenhuma linha) --
 *  a rota devolve 422 com a mensagem; o script sai com erro. */
export class ErroEntradaKpi extends Error {}

export type EntradaKpiNutrimax = {
  data: string
  escala: LinhaEscala[]
  romaneio: LinhaRomaneio[]
  pao: { linhas: LinhaRomaneio[]; escala: LinhaEscala[] }
  /** Escala de Rota foi enviada (sem ela, nenhum aviso sem_escala). */
  escalaEnviada: boolean
  /** Romaneio do Pao foi enviado. */
  paoEnviado: boolean
}

/** Ganchos de experimento do script de regeracao -- a rota nunca usa. */
export type OpcoesKpiNutrimax = {
  sobreporGeo?: (geoPorEndereco: Map<string, ResultadoGeocode>) => void
  semCadastroUnitrac?: boolean
  /** Ignora o cadastro de locais dos clientes (comparação antes/depois). */
  semLocaisClientes?: boolean
  aoMontarDetalhe?: (x: { romaneioGeo: LinhaGeocodificada[]; detalhe: LinhaDetalheEntrega[]; paradasPorPlaca: Map<string, UnitracParadaRow[]> }) => void
}

export type ResultadoKpiNutrimax = {
  xlsx: Buffer
  /** Ja' com as resolucoes manuais aplicadas. */
  detalhe: LinhaDetalheEntrega[]
  /** Consistentes com o detalhe (NF CONFIRMADAS = ENTREGUE das abas). */
  linhasKpi: LinhaKpiRomaneio[]
  avisos: AvisoDescasamento[]
  qtdCargasNutry: number
}

export async function gerarKpiNutrimax(entrada: EntradaKpiNutrimax, opcoes?: OpcoesKpiNutrimax): Promise<ResultadoKpiNutrimax> {
  const data = entrada.data
  // Tempo por etapa (06/10, "a geração demora" é a maior reclamação): vai pro log.
  const tempos: [string, number][] = []
  let t0 = Date.now()
  const marcar = (etapa: string) => { const agora = Date.now(); tempos.push([etapa, agora - t0]); t0 = agora }
  let { escala, romaneio } = entrada
  let resultadoPao = entrada.pao
  // Achado real 12/09: esta trava existia porque a UNICA fonte de parada era
  // o feed da Unitrac (48h). Isso impedia reprocessar qualquer dia passado --
  // inclusive pra medir o efeito de uma correcao de geocode, que foi
  // exatamente o que travou a reauditoria do dia 10/09. Agora ha fonte
  // permanente: o monitoramento guarda posicao continua e a ponte deriva as
  // paradas dela (ver derivarParadas / paradasDaPonte). Data antiga passa a
  // ser permitida; se nem a ponte tiver dado daquele dia, cada placa fica
  // sem parada e o relatorio sai com as NFs sem confirmacao por GPS -- o
  // mesmo fail-open do resto do pipeline, nunca um erro seco.
  const foraDaJanelaUnitrac = foraDoAlcanceApi(data, hojeBR())
  if (foraDaJanelaUnitrac) {
    console.warn(`[kpi/nutrimax] data ${data} fora da janela de 48h da Unitrac -- usando paradas derivadas do historico do monitoramento`)
  }

  // Troca de placa informada pela operação (tela Placas do dia, 05/10).
  const trocas = await buscarTrocasDoDia(EMPRESA_NUTRIMAX, data)
  if (trocas.length > 0) {
    ;({ romaneio, escala } = aplicarTrocasDePlaca(romaneio, escala, trocas))
    const pao = aplicarTrocasDePlaca(resultadoPao.linhas, resultadoPao.escala, trocas)
    resultadoPao = { ...resultadoPao, linhas: pao.romaneio, escala: pao.escala }
  }
  marcar('trocas')
  const escalaCompleta = [...escala, ...resultadoPao.escala]
  const romaneioCompleto = [...romaneio, ...resultadoPao.linhas]

  // Fix (revisao final de branch 15/09, Important 4): esta guarda e' sobre o
  // Romaneio de Entrega DA NUTRY MAX especificamente (o unico documento
  // obrigatorio). Checar `romaneioCompleto` deixava um romaneio principal
  // totalmente irreconhecivel passar em silencio so' porque o pao trouxe
  // alguma linha -- exatamente o caso em que o operador mais precisa do
  // aviso. Continua valendo mesmo com o pao enviado.
  if (romaneio.length === 0) {
    throw new ErroEntradaKpi('Nenhuma linha reconhecida no Romaneio de Entrega — confira se o PDF é o "Romaneio de Entrega" da Nutry Max.')
  }

  // Geocodifica todos os endereços únicos do dia numa única chamada em
  // lote -- eficiência e respeito ao rate-limit da cascata do lado do
  // monitoramento (ver src/lib/kpi-romaneio/geocode.ts).
  const enderecosUnicos = [...new Set(romaneioCompleto.map(l => l.endereco))]
  const { resultados: resultadosGeo, parciais: geocodeParciais } = await geocodificarEnderecosComInfo(enderecosUnicos, { validarTerritorio: true })
  marcar('geocode')
  const geoPorEndereco = new Map(enderecosUnicos.map((e, i) => [e, resultadosGeo[i]]))
  opcoes?.sobreporGeo?.(geoPorEndereco)

  // Task 2 (plano 2026-09-30, item 4): geoSemFonte = cache sem `fonte` (ver guarda 4 da parada proxima em agregacao.ts).
  const romaneioGeo: LinhaGeocodificada[] = romaneioCompleto.map(l => {
    const g = geoPorEndereco.get(l.endereco) ?? null
    return { ...l, lat: g?.lat ?? null, lng: g?.lng ?? null, geoConfiavel: g?.confiavel ?? true, geoMotivo: narrowGeoMotivo(g?.motivo), geoSemFonte: g != null && !g.fonte, geoVerificadoManual: g != null && FONTES_VERIFICADAS.has(g.fonte ?? '') }
  })

  // Cadastro de locais dos clientes (05/10, scripts/aprender-locais-clientes.ts):
  // cliente com coordenada aprendida/corrigida usa ela, nao o geocode do texto
  // (que muda quando o endereco vem escrito diferente). Quem recebeu local fica
  // fora do resgate por ancora abaixo -- ja' esta' no lugar certo.
  const nfsComLocal = new Set<string>()
  if (!opcoes?.semLocaisClientes) {
    const { linhas, aplicados } = aplicarLocaisClientes(romaneioGeo, await buscarLocaisClientes(CLIENTE_LOCAIS))
    romaneioGeo.splice(0, romaneioGeo.length, ...linhas)
    aplicados.forEach(nf => nfsComLocal.add(nf))
  }

  // Item 5 (achado real 10-09, auditoria com a Ana): port do Passo 7 do motor
  // de geolocalizacao universal (ver kpi-rioquality/pipeline.ts, formato
  // completo) -- endereco que a cascata precisa nao resolveu de jeito
  // nenhum (sem_candidato, lat==null) tenta de novo usando como ANCORA as
  // coordenadas de OUTRAS entregas da MESMA placa/dia que ja' resolveram.
  //
  // Item 5.2 (achado real, colapso de via longa -- Icaraí/RQV3G18/TOS0G53,
  // mesmo padrao em 3 dias auditados com a Ana): quando o CNEFE nao acha o
  // numero da casa numa rua longa, ele cai pro CENTRO da rua inteira --
  // enderecos DIFERENTES (numeros diferentes) geocodificam pro MESMO ponto
  // exato. Isso nao e' sem_candidato (lat != null, confiavel = true) nem e'
  // pego pelo guard territorial (bairro/municipio batem, so' a precisao e'
  // ruim) -- nenhum mecanismo cobria esse caso. Detecta colisao agrupando
  // enderecos UNICOS por coordenada: 2+ enderecos DIFERENTES no mesmo
  // lat/lng exato e' assinatura de colapso (coincidencia real exigiria
  // precisao de ponto flutuante identica, praticamente impossivel), nunca
  // dois clientes genuinamente vizinhos. Entra no MESMO resgate por ancora
  // do item 5 -- so' entra quem tem pelo menos 1 ancora na propria placa
  // (placa com tudo sem_candidato/colidido nao tem com que comparar), e a
  // ancora nunca pode ser outra linha colidida (ponto colapsado nao serve
  // de referencia). Fail-open: erro na ponte devolve null pra todo mundo
  // (ja' tratado dentro de reposicionarPorAncoras), o resto do pipeline
  // segue igual a hoje se o resgate nao achar nada melhor.
  marcar('locais')
  const enderecosColididos = enderecosColididosPorCoordenada(geoPorEndereco)

  const indicePorNf = new Map(romaneioGeo.map((l, i) => [l.nf, i]))
  const precisaResgatePorPlaca = agrupar(
    romaneioGeo.filter(l => !nfsComLocal.has(l.nf) && (l.lat == null || enderecosColididos.has(l.endereco))),
    l => normPlaca(l.placa),
  )
  if (precisaResgatePorPlaca.size > 0) {
    const gruposAncoras = [...precisaResgatePorPlaca.entries()].map(([placaNorm, linhas]) => ({
      id: placaNorm,
      ruas: linhas.map(l => chaveCacheEndereco(l.endereco)),
      ancoras: romaneioGeo
        .filter((o): o is LinhaGeocodificada & { lat: number; lng: number } =>
          normPlaca(o.placa) === placaNorm && o.lat != null && o.lng != null && !enderecosColididos.has(o.endereco))
        .map(o => ({ lat: o.lat, lng: o.lng })),
    }))
    const resgate = await reposicionarPorAncoras(gruposAncoras)
    for (const [placaNorm, linhas] of precisaResgatePorPlaca) {
      const resultadosResgate = resgate.get(placaNorm) ?? []
      linhas.forEach((l, i) => {
        const r = resultadosResgate[i]
        if (!r) return
        const idx = indicePorNf.get(l.nf)!
        romaneioGeo[idx] = { ...romaneioGeo[idx], lat: r.lat, lng: r.lng }
      })
    }
  }

  marcar('resgate')
  const linhasPorPlaca = agrupar(romaneioGeo, l => normPlaca(l.placa))
  // Achado Minor #10 da revisão final do plano do pão (15/09): carga do pão
  // sem CARRO no PDF vira placa '' aqui -- montarDetalheEntregas (linha de
  // detalhe por NF) já curto-circuita incondicionalmente pra essa placa (ver
  // "CARGA SEM PLACA NO ROMANEIO" em agregacao.ts). agregarPorCarga (resumo
  // por carga) NÃO tem essa guarda explícita -- recebe paradasPorPlaca.get('')
  // / horarioBasePorPlaca.get('') normalmente, e só funciona certo na prática
  // porque a ponte nunca retorna dado real pra placa vazia (fica tudo vazio
  // por ausência de dado, não por um curto-circuito dedicado). De qualquer
  // forma, consultar Unitrac/ponte pra ela é trabalho de rede desperdiçado.
  const placasNorm = [...linhasPorPlaca.keys()].filter(p => p !== '')
  logarNfDuplicadaNaMesmaPlaca(linhasPorPlaca)

  // Coordenadas de cada NF geocodificada, pra pedir tambem CHEGADA/SAIDA
  // NA LOJA via a mesma ponte (id = NF, ver base-horarios.ts). Linha sem
  // coordenada (geocode falhou) simplesmente nao entra -- confirmacao
  // dessa NF continua podendo vir so' do Unitrac, sem bloquear nada.
  const pontosPorPlacaBridge = new Map<string, { id: string; lat: number; lng: number }[]>()
  for (const [placaNorm, linhasDaPlaca] of linhasPorPlaca) {
    const pontos = linhasDaPlaca
      .filter((l): l is LinhaGeocodificada & { lat: number; lng: number } => l.lat != null && l.lng != null)
      .map(l => ({ id: l.nf, lat: l.lat, lng: l.lng }))
    if (pontos.length > 0) pontosPorPlacaBridge.set(placaNorm, pontos)
  }

  // Alvos antes da ponte: o cadastro Unitrac (pontoLat/pontoLng) casado por
  // placa+NF vira latAlt/lngAlt de cada ponto (coordenada alternativa).
  const [frota, alvosBrutos] = await Promise.all([
    buscarFrota(COD_USER_NUTRIMAX),
    buscarAlvosDoDia(placasNorm, { comAlias: true }),
  ])
  marcar('frota+alvos')
  const alvos = await alvosEfetivos('nutrimax', data, hojeBR(), alvosDaData(alvosBrutos, data), placasNorm)
  // Achado real 14/09: pede paradas SEMPRE agora, nao so' fora da janela
  // -- a ponte virou fonte primaria (ver resolverParadas em unitrac.ts).
  // Achado 30/09 (RQO9H37 = RQ0-9H37 na frota, ver alias-placa.ts): placa
  // da escala com variante O/0 ou I/1 na frota consulta as duas grafias e
  // fica com a que tem sinal no dia; tudo segue chaveado pela do romaneio.
  const aliasPlacas = resolverAliasPlacas(placasNorm, frota.map(v => v.placaNorm))
  const { horarios: horarioBasePorPlaca, consulta: placaConsulta } = await buscarHorariosBaseComAlias(placasNorm, data, opcoes?.semCadastroUnitrac ? pontosPorPlacaBridge : anexarCoordenadaCadastro(pontosPorPlacaBridge, alvos), true, aliasPlacas)
  const cvPorPlaca = montarCvPorPlaca(frota, placaConsulta)
  // Pedido do usuário 25/08 (nível Benassi): placa sem cv na Unitrac E sem
  // entrada na ponte do monitoramento (nunca respondeu por ela, nem com
  // null) não teve NENHUMA fonte de rastreamento no dia -- ver
  // gerador-xlsx.ts/motivoAusencia.
  // Task 8 (24/09): declaração manual da operação (TTL5J17: tem cv e a
  // ponte respondeu, mas é caminhão sem rastreador de verdade) vence as
  // duas fontes acima -- ver placas-sem-rastreador.ts.
  marcar('ponte monitoramento')
  const placasSemRastreador = aplicarAliasEmConjunto(placasSemRastreadorNoDia(await buscarPlacasSemRastreador(EMPRESA_NUTRIMAX), data), aliasPlacas)
  // temRastreadorPorPlaca: montado mais abaixo (depois das paradas/alvos), ver placasSemSinal.

  // Por placa (não por carga -- as paradas GPS do dia cobrem a placa
  // inteira, independente de quantas cargas ela rodou): busca paradas,
  // monta visitas por perímetro próprio e calcula km percorrido. Placa sem
  // correspondência na frota (sem cv) fica sem GPS -- confirmação ainda
  // pode vir só do alvo Unitrac (situacao===1), sem bloquear a carga.
  const paradasPorPlaca = new Map<string, UnitracParadaRow[]>()
  const visitasPorPlaca = new Map<string, Map<string, Visita>>()
  const kmPorPlaca = new Map<string, number | null>()
  // Fix round 1 (revisao 24/09 da Task 10, achado da revisao de codigo):
  // `paradasPorPlaca` (preenchido abaixo) e' o resultado de `resolverParadas`,
  // que PREFERE a ponte do monitoramento e descarta as paradas cruas da
  // Unitrac inteiras sempre que a ponte respondeu e nao houve apagao de sinal
  // detectado -- mesmo quando a ponte tambem congelou sem disparar esse flag
  // (o caso exato que a Task 10 resolve). A busca do horario pelo alvo feito
  // (agregacao.ts, `paradasUnitracCruasPropriaPlaca`) precisa das paradas
  // CRUAS -- `paradasEfetivasPorPlaca`/`paradasEfetivasExtraPorPlaca` abaixo,
  // ANTES de resolverParadas escolher -- guardadas aqui à parte, nunca
  // misturadas com `paradasPorPlaca`.
  const paradasUnitracCruasPorPlaca = new Map<string, UnitracParadaRow[]>()

  // Task 7 (24/09): /stops da Unitrac so' guarda 48h -- gerar um dia depois
  // disso traz paradas incompletas (nuncaSaiuDaBase falso-positivo). Busca a
  // API crua por placa e so' DEPOIS passa pelo snapshot (paradasEfetivas),
  // que mescla com o que o cron noturno ja capturou daquele dia.
  // Cache do dia (06/10): paradas da Unitrac por placa reaproveitadas entre
  // gerações (4 min hoje, 6 h dia passado) -- era metade do tempo da geração.
  const cacheParadas = await lerCacheDia<UnitracParadaRow[]>('paradas', data, hojeBR())
  const paradasNovas = new Map<string, UnitracParadaRow[]>()
  const paradasDaPlaca = async (cv: string, placaNorm: string): Promise<UnitracParadaRow[]> => {
    const k = `${cv}|${placaNorm}`
    const c = cacheParadas.get(k)
    if (c) return c
    const p = await buscarParadasDoDia(cv, placaNorm, data, 48)
    paradasNovas.set(k, p)
    return p
  }
  const daUnitracPorPlaca = new Map<string, UnitracParadaRow[]>()
  await mapComLimite(placasNorm, LIMITE_CONCORRENCIA_PLACAS, async placaNorm => {
    const cv = cvPorPlaca.get(placaNorm)
    daUnitracPorPlaca.set(placaNorm, cv ? await paradasDaPlaca(cv, placaNorm) : [])
  })
  // Achado real 25/09 (RQQ5B81/NF 2386225 23/09): fora da janela de 48h, o
  // feed da Unitrac so' cobre o dia inteiro se o snapshot tinha a placa --
  // senao e' retalho e nao pode vencer a ponte (ver resolverParadas).
  const placasNoSnapshot = new Set<string>()
  const unitracCobreODia = (placaNorm: string) => !foraDaJanelaUnitrac || placasNoSnapshot.has(placaNorm)
  marcar('paradas unitrac (romaneio)')
  const paradasEfetivasPorPlaca = await paradasEfetivas('nutrimax', data, hojeBR(), daUnitracPorPlaca, placasNoSnapshot)

  for (const placaNorm of placasNorm) {
    const daUnitrac = paradasEfetivasPorPlaca.get(placaNorm) ?? []
    paradasUnitracCruasPorPlaca.set(placaNorm, daUnitrac)
    // Sem parada nenhuma da Unitrac (dia fora das 48h, ou placa sem cv) mas
    // com parada derivada do historico permanente: usa a da ponte.
    const daPonte = horarioBasePorPlaca.get(placaNorm)?.paradas
    const paradas = resolverParadas(daUnitrac, daPonte, placaNorm, horarioBasePorPlaca.get(placaNorm)?.apagaoDeSinal ?? false, unitracCobreODia(placaNorm))
    paradasPorPlaca.set(placaNorm, paradas)
    visitasPorPlaca.set(placaNorm, montarVisitas(linhasPorPlaca.get(placaNorm) ?? [], paradas, horarioBasePorPlaca.get(placaNorm)?.visitasPorNf))
    kmPorPlaca.set(placaNorm, calcularKmPercorrido(paradas))
  }

  // Achado real 06/09 (grupo KPI AJUSTES, placa TTH-3C94): "carga
  // transferida" (acharParadaDeOutraPlaca em agregacao.ts) so' enxerga
  // placa que aparece no ROMANEIO do dia -- se o caminhao que realmente
  // pegou a carga trocada e' um RESERVA/backup que nao tem NENHUMA NF sua
  // no romaneio (o papel continua no nome do caminhao original), o sistema
  // nunca busca o GPS dele e a troca fica invisivel pros dois lados: o
  // original marca pendente/nao-confirmado, e quem entregou de verdade nao
  // aparece em lugar nenhum. Busca GPS tambem da FROTA INTEIRA da Nutry Max
  // (buscarFrota ja' devolve isso, direto da Unitrac -- sem cadastro
  // manual nosso) so' pra alimentar paradasPorOutraPlaca -- nao cria linha/
  // aba de relatorio pra placa que nao tem NF nenhuma no romaneio
  // (placasNorm continua sendo so' quem apareceu nele).
  // Grafia da frota absorvida por placa da escala (alias) e' o MESMO
  // caminhao -- nunca vira "outra placa" (carga transferida falsa).
  const grafiasAlias = placasAliasDaFrota(aliasPlacas)
  const placasFrotaExtra = frota.map(v => v.placaNorm).filter(p => !paradasPorPlaca.has(p) && !grafiasAlias.has(p))
  const daUnitracExtraPorPlaca = new Map<string, UnitracParadaRow[]>()
  await mapComLimite(placasFrotaExtra, LIMITE_CONCORRENCIA_PLACAS, async placaNorm => {
    const cv = cvPorPlaca.get(placaNorm)
    daUnitracExtraPorPlaca.set(placaNorm, cv ? await paradasDaPlaca(cv, placaNorm) : [])
  })
  await gravarCacheDia('paradas', data, paradasNovas)
  marcar('paradas unitrac (frota extra)')
  const paradasEfetivasExtraPorPlaca = await paradasEfetivas('nutrimax', data, hojeBR(), daUnitracExtraPorPlaca, placasNoSnapshot)
  for (const placaNorm of placasFrotaExtra) {
    const daUnitrac = paradasEfetivasExtraPorPlaca.get(placaNorm) ?? []
    const daPonte = horarioBasePorPlaca.get(placaNorm)?.paradas
    paradasPorPlaca.set(placaNorm, resolverParadas(daUnitrac, daPonte, placaNorm, horarioBasePorPlaca.get(placaNorm)?.apagaoDeSinal ?? false, unitracCobreODia(placaNorm)))
  }

  const alvosPorPlaca = agrupar(opcoes?.semCadastroUnitrac ? [] : alvos, a => a.placaNorm)
  // 29/09 (ordem direta do usuario): placa da escala SEM SINAL NO DIA (ponte
  // com <2 posicoes, nenhuma parada fora da base na Unitrac, nenhum alvo
  // feito) vira SEM RASTREADOR automatico, com o dia encerrado ou em
  // andamento -- nunca "aguardando". Ver placaSemSinalNoDia. Mesmo calculo
  // em route.ts e scripts/gerar-nutrimax-real-arquivo.ts (paridade).
  // Trava (revisao independente 29/09): coletor do monitoramento fora do ar
  // devolve consulta 'ok' porem vazia pra TODA placa -- acima de
  // LIMITE_FRACAO_SEM_SINAL_AUTOMATICO da escala ninguem e' concluido sem
  // sinal (tabela manual segue valendo) e o aviso vai pro log e aba Avisos.
  const travaSemSinal = placasSemSinalComTrava(placasNorm, horarioBasePorPlaca, paradasUnitracCruasPorPlaca, alvosPorPlaca)
  if (travaSemSinal.aviso) console.warn(`[KPI ${data}] ${travaSemSinal.aviso}`)
  const placasSemSinal = travaSemSinal.placas
  const temRastreadorPorPlaca = montarTemRastreadorPorPlaca(placasNorm, cvPorPlaca, horarioBasePorPlaca, placasSemRastreador, placasSemSinal)

  // Achado real 22/09 (RBG5G18 21/09): quando a ULTIMA volta a base
  // registrada e' na verdade uma volta extra sem entrega (fim da rota --
  // ultima saida com entrega -- veio bem antes dela), CHEGADA CD tem que
  // ser a PRIMEIRA volta a base depois disso, nao a ultima do dia. Muta
  // horarioBasePorPlaca in-place antes de virar chegadaCd em agregarPorCarga.
  // Ruling do controller (revisao final 22/09): so' ajusta quando TODAS as
  // NFs do romaneio da placa (linhasPorPlaca) ja' estao confirmadas.
  const nfsPorPlaca = new Map([...linhasPorPlaca].map(([p, linhas]) => [p, linhas.map(l => l.nf)]))
  await ajustarChegadaAposUltimaEntrega(placasNorm, data, horarioBasePorPlaca, visitasPorPlaca, alvosPorPlaca, nfsPorPlaca, placaConsulta)

  // Cargas vêm do Romaneio -- é a fonte de verdade de quantas cargas
  // existiram no dia. A Escala só complementa (destino/motorista/peso/
  // planejado) quando há correspondência por carga+placa.
  const escalaPorChave = new Map(escalaCompleta.map(e => [`${e.carga}::${e.placaNorm}`, e]))
  const cargasPorChave = agrupar(romaneioGeo, l => `${l.carga}::${normPlaca(l.placa)}`)

  const linhasKpi: LinhaKpiRomaneio[] = [...cargasPorChave.entries()]
    .map(([chave, linhasDaCarga]) => {
      const [carga, placaNorm] = chave.split('::')
      const escalaDaCarga = escalaPorChave.get(chave) ?? null
      return agregarPorCarga(
        carga,
        placaNorm,
        linhasDaCarga,
        escalaDaCarga,
        alvosPorPlaca.get(placaNorm) ?? [],
        visitasPorPlaca.get(placaNorm) ?? new Map(),
        paradasPorPlaca.get(placaNorm) ?? [],
        kmPorPlaca.get(placaNorm) ?? null,
        horarioBasePorPlaca.get(placaNorm),
        temRastreadorPorPlaca.get(placaNorm) ?? false,
        // Task 3 (plano 2026-10-03): status do rastreador declarado na escala.
        // "SEM RASTRI" na escala vence qualquer fonte de dado e exclui a placa
        // inteira do denominador da TAXA.
        escalaDaCarga?.statusRastreador ?? null,
      )
    })
    .sort((a, b) => a.carga.localeCompare(b.carga) || a.placa.localeCompare(b.placa))

  // resumoPorChave (pedido do usuario 25/08): montarDetalheEntregas repete
  // motorista/saidaCd/chegadaCd/tempoOperacaoMin da carga inteira em toda
  // linha de NF -- mesma chave carga+placa usada pra montar linhasKpi acima.
  const resumoPorChave = new Map(linhasKpi.map(l => [`${l.carga}::${l.placa}`, l]))

  // Task 3b (verificacao manual 26/09): NF -> menor distancia do trajeto
  // continuo (agora que a ponte expoe `menorDistanciaM` por visita) --
  // fecha o Concern do relatorio da Task 3 (agregacao.ts). So' o fluxo
  // Nutry Max passa isto pra `montarDetalheEntregas`; Rio Quality
  // (pipeline.ts) continua com o default vazio, intocado.
  const menorDistanciaTrajetoPorNf = montarMenorDistanciaTrajetoPorNf(horarioBasePorPlaca)

  // Aba "Detalhamento" (pedido do usuário 24/08): uma linha por NF/entrega,
  // não só o resumo por carga -- mesma fonte de dado (linhasDaCarga/alvos/
  // visitas) já calculada acima pra agregarPorCarga, só que sem agregar.
  const detalheMontado: LinhaDetalheEntrega[] = [...cargasPorChave.entries()]
    .flatMap(([chave, linhasDaCarga]) => {
      const [carga, placaNorm] = chave.split('::')
      const resumo = resumoPorChave.get(chave)
      return montarDetalheEntregas(
        carga,
        placaNorm,
        linhasDaCarga,
        alvosPorPlaca.get(placaNorm) ?? [],
        visitasPorPlaca.get(placaNorm) ?? new Map(),
        {
          motorista: resumo?.motorista ?? '',
          saidaCd: resumo?.saidaCd ?? null,
          chegadaCd: resumo?.chegadaCd ?? null,
          tempoOperacaoMin: resumo?.tempoOperacaoMin ?? null,
        },
        temRastreadorPorPlaca.get(placaNorm) ?? false,
        paradasPorPlaca,
        // Mesmo valor final ja mostrado no resumo da carga (prefere a
        // ponte de posicao continua real -- ver agregarPorCarga -- em vez
        // do fallback baseado so' em paradas da Unitrac).
        resumo?.kmPercorrido ?? null,
        // Ver comentario de diaEmAndamento/calcularDiaEmAndamento em
        // agregacao.ts: so' "em andamento" quando o relatorio e' de HOJE e
        // essa rota especifica ainda nao retornou pra base (chegadaCd null)
        // -- dia passado com chegadaCd null e' outra coisa (rota que
        // genuinamente nunca voltou), nao deve virar "aguardando".
        calcularDiaEmAndamento(data, resumo?.chegadaCd ?? null),
        // Fix 12/09 (Finding 3): rotulo de ilha (Vila do Abraao) e' so' desta
        // pipeline -- ver comentario de verificarAcessoIlha em agregacao.ts.
        true,
        // Item 3b (spec 2026-09-12): parada curta compartilhada entre
        // enderecos distintos e' so' desta pipeline -- ver comentario de
        // detectarParadaCurtaCompartilhada em agregacao.ts.
        true,
        // Fix round 1 (Task 10): paradas CRUAS da Unitrac da propria placa
        // (pre-resolverParadas) -- ver comentario de
        // paradasUnitracCruasPorPlaca acima.
        paradasUnitracCruasPorPlaca,
        // Revisao final pre-deploy (24/09, item 1): semRastreadorNoDia e o
        // rotulo unificado "SEM RASTREADOR ... NAO CONTABILIZADO" sao so'
        // desta pipeline -- ver tratarSemRastreadorNoDia em agregacao.ts.
        true,
        // Task 1 (plano 2026-09-25, mudanca de requisito -- decisao da
        // operacao): na Nutry Max nao existe "entrega por outra placa" --
        // desativa `acharParadaDeOutraPlaca` de vez, so' desta pipeline. Ver
        // desativarOutraPlaca em agregacao.ts.
        true,
        // Task 2 (plano 2026-09-25, R2): confirma pela parada Unitrac CRUA da
        // PROPRIA placa quando nada mais confirmou -- so' desta pipeline. Ver
        // confirmarPorParadaUnitracPropria em agregacao.ts.
        true,
        // Fix round 2 (revisao de codigo): TODAS as NFs da placa no dia
        // (todas as cargas), nao so' desta carga -- ver todasLinhasDaPlacaNoDia
        // em agregacao.ts.
        linhasPorPlaca.get(placaNorm) ?? [],
        // Task 2 (plano 2026-09-26, verificacao manual 24/09): sinal da ponte
        // (HorarioBase.apagaoDeSinal, ja usado por resolverParadas em
        // unitrac.ts) reaproveitado pra detectar GPS congelado -- so' desta
        // pipeline. Ver apagaoDeSinalPropriaPlaca em agregacao.ts.
        horarioBasePorPlaca.get(placaNorm)?.apagaoDeSinal ?? false,
        // Task 3b (verificacao manual 26/09): NF -> menor distancia do
        // trajeto continuo, ja construido acima (montarMenorDistanciaTrajeto
        // PorNf) -- so' desta pipeline. Ver menorDistanciaTrajetoPorNf em
        // agregacao.ts.
        menorDistanciaTrajetoPorNf,
        // Task 4 (plano 2026-09-26, verificacao manual 24/09): "na Nutry Max
        // nao existe troca de caminhao" -- escala/romaneio com placa
        // provavelmente errada viram pedido de conferencia, nao "NAO FOI"
        // nem "ENTREGUE POR OUTRA PLACA" -- so' desta pipeline. Ver
        // detectarEscalaDivergente em agregacao.ts.
        true,
        // Task 1 (plano 2026-09-26): proximidade fraca vira REVISAR, nunca
        // ENTREGUE -- so' desta pipeline. Ver modoPrecisao em agregacao.ts.
        true,
        // Task 2 (plano 2026-09-26): rodizio de carga inteira vira ROTA
        // EXECUTADA POR OUTRA PLACA -- so' desta pipeline. Ver
        // reconhecerRodizio em agregacao.ts.
        // Desligado 29/09: decisao do usuario/Ana -- nenhuma NF e' confirmada
        // por parada de outro veiculo.
        false,
        // Item 3 (revisao final 26/09): pontos de referencia dos clientes do
        // PROPRIO executor no dia (descarta parada do rodizio explicada por
        // outro cliente dele, ou acima do teto de 4h de permanencia) -- ver
        // linhasPorPlacaNoDia em agregacao.ts.
        linhasPorPlaca,
        // Task 3 (plano 2026-10-03): placa marcada "SEM RASTRI" na escala ->
        // todas as NFs dessa placa recebem rotulo especifico e sao excluidas
        // do denominador da TAXA. Ver placaSemRastriNaEscala em agregacao.ts.
        escalaPorChave.get(chave)?.statusRastreador?.trim().toUpperCase() === 'SEM RASTRI',
      )
    })
    .sort((a, b) => a.carga.localeCompare(b.carga) || a.placa.localeCompare(b.placa) || a.nf.localeCompare(b.nf))
  // Auditoria 07/10: entregue por parada fora do bairro/municipio do endereco
  // (cadastro Unitrac errado) vira "conferir" -- ver parada-fora-do-endereco.ts.
  const detalheConferido = await conferirParadaForaDoEndereco(detalheMontado, {
    linhaPorNf: new Map(romaneioGeo.map(l => [l.nf, l])),
    alvoPorNf: new Map((opcoes?.semCadastroUnitrac ? [] : alvos).filter(a => a.documento).map(a => [a.documento as string, a])),
    paradasPorPlaca,
    paradasCruasPorPlaca: paradasUnitracCruasPorPlaca,
    data,
  }, verificarTerritorioNaPonte)
  const detalhe: LinhaDetalheEntrega[] = detalheConferido
  opcoes?.aoMontarDetalhe?.({ romaneioGeo, detalhe, paradasPorPlaca })

  // Aviso agregado de descasamento Escala<->Romaneio (ver spec, secao
  // "Tratamento de erro/ambiguidade") -- aditivo, nunca bloqueia o resto do
  // relatorio. Usa a MESMA chave carga+placa ja calculada acima.
  const cargasRomaneioList = [...cargasPorChave.entries()].map(([chave, linhasDaCarga]) => {
    const [carga, placaNorm] = chave.split('::')
    // Task 2 (plano 2026-09-30, item 2): NFs distintas do Romaneio da carga,
    // comparadas com NF PLANEJADO da Escala -> aviso 'nf_divergente'.
    return { carga, placaNorm, nfsRomaneio: new Set(linhasDaCarga.map(l => l.nf)).size }
  })
  // Achado 10/09: sem Escala nenhuma (escalaBuf null), `escala` fica [] --
  // detectarDescasamentos compararia isso com o Romaneio e marcaria TODA
  // carga como "sem_escala" (79 avisos so' porque o documento nao veio, nao
  // porque tem descasamento de verdade entre os dois). So' roda a checagem
  // quando a Escala de fato foi enviada.
  // Fix (revisao final de branch 15/09, Critical 1): os dois documentos tem
  // escalas INDEPENDENTES -- a Escala de Rota cobre so' as cargas Nutry Max,
  // a escala sintetica do pao cobre so' as cargas PAO-*. Rodar a checagem
  // sobre o conjunto misturado reintroduzia o bug de 10/09 ao contrario:
  // enviando SO' o Romaneio do Pao (sem Escala de Rota), `escalaCompleta`
  // so' tinha a escala do pao e TODA carga Nutry Max voltava a sair
  // "sem_escala". Cada escopo roda contra a sua propria fonte, e so' quando
  // o documento correspondente de fato veio.
  const ehCargaPao = (carga: string) => carga.startsWith(PAO_PREFIXO)
  const avisos = [
    ...(entrada.escalaEnviada ? detectarDescasamentos(escala, cargasRomaneioList.filter(c => !ehCargaPao(c.carga))) : []),
    ...(entrada.paoEnviado ? detectarDescasamentos(resultadoPao.escala, cargasRomaneioList.filter(c => ehCargaPao(c.carga))) : []),
    ...detectarMotoristaMultiplasPlacas(escalaCompleta),
    ...detectarCargaMultiRegiao(romaneioGeo),
  ].sort((a, b) => a.carga.localeCompare(b.carga) || a.placa.localeCompare(b.placa))
  if (travaSemSinal.aviso) {
    avisos.push({ carga: '—', placa: '—', motivo: 'consulta_posicoes_suspeita', semSinal: travaSemSinal.semSinal, totalPlacas: travaSemSinal.totalPlacas })
  }
  const falhasPonte = consumirFalhasPonte()
  if (falhasPonte > 0) avisos.push({ carga: '—', placa: '—', motivo: 'ponte_falhou', placasSemPonte: falhasPonte })
  if (geocodeParciais > 0) {
    avisos.push({ carga: '—', placa: '—', motivo: 'geocode_parcial', enderecosParciais: geocodeParciais })
  }

  // Task 4 (plano 24/09): camada de resolucao manual por NF -- aditiva, nunca
  // pode quebrar a geracao. `kpi_nf_resolucao` so' existe a partir do deploy
  // desta task; ate' la', buscarResolucoes lanca (tabela inexistente) e a
  // geracao segue normalmente sem nenhuma resolucao aplicada (mesmo relatorio
  // de hoje, so' logando o motivo).
  let historicoResolucoes: Awaited<ReturnType<typeof buscarResolucoes>> = []
  try {
    historicoResolucoes = await buscarResolucoes(EMPRESA_NUTRIMAX, data)
  } catch (err) {
    console.error('resolucoes manuais indisponiveis (tabela kpi_nf_resolucao ainda nao existe? ok antes do deploy da Task 4):', err)
  }
  const detalheComResolucao = aplicarResolucoes(detalhe, historicoResolucoes)

  // Bug real 25/09 (ver comentário completo de `contarConfirmadasPorCarga`
  // em agregacao.ts): `agregarPorCarga` (linhasKpi acima) so' enxerga
  // confirmadoUnitrac/confirmadoGps -- nao rodizio de carga inteira, R2,
  // parada curta/proxima etc, que `montarDetalheEntregas` (detalhe) decide
  // depois. `paradasReais`/"NF CONFIRMADAS" do resumo tem que contar
  // EXATAMENTE as mesmas NFs que saem 'ENTREGUE' nas abas por placa --
  // sobrescreve com a contagem real (nunca uma segunda regra de
  // confirmação, so' substitui a simplificada por essa).
  const confirmadasPorChave = contarConfirmadasPorCarga(detalheComResolucao)
  const linhasKpiConsistentes: LinhaKpiRomaneio[] = linhasKpi.map(l => {
    const paradasReais = confirmadasPorChave.get(`${l.carga}::${l.placa}`) ?? 0
    return {
      ...l,
      paradasReais,
      status: l.nfPlanejado != null && paradasReais < l.nfPlanejado ? 'INCOMPLETO' : 'OK',
    }
  })

  // Aviso de troca de placa (04/10): so' informa qual placa fez a carga.
  const trocasProvaveis = detectarTrocasProvaveis(cargasPorChave, cargasEscalaDivergenteInteira(detalheComResolucao), paradasPorPlaca)

  marcar('agregacao')
  const xlsxBuf = await gerarKpiRomaneioXlsx(linhasKpiConsistentes, data, avisos, detalheComResolucao, undefined, undefined, {
    trocasProvaveis,
    // Linha de resumo (taxa automatica/apos conferencia) so' na Nutry Max --
    // ver `opcoes.resumoConfirmacao` em gerador-xlsx.ts.
    resumoConfirmacao: true,
  })
  marcar('xlsx')
  console.log(`[kpi tempo] ${data} total ${Math.round(tempos.reduce((a, [, ms]) => a + ms, 0) / 1000)}s | ` + tempos.map(([e, ms]) => `${e} ${(ms / 1000).toFixed(1)}s`).join(' | '))

  return {
    xlsx: xlsxBuf,
    detalhe: detalheComResolucao,
    linhasKpi: linhasKpiConsistentes,
    avisos,
    qtdCargasNutry: linhasKpi.filter(l => !l.carga.startsWith(PAO_PREFIXO)).length,
  }
}
