import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPerfil, empresaLiberada } from '@/lib/perfil'
import { buscarFrota, normPlaca } from '@/lib/unitrac-api'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import { hojeBR } from '@/lib/data-br'
import { parseEscala } from '@/lib/kpi-romaneio/parse-escala'
import { parseRomaneio } from '@/lib/kpi-romaneio/parse-romaneio'
import { parsePao } from '@/lib/kpi-romaneio/parse-pao'
import { geocodificarEnderecos } from '@/lib/kpi-romaneio/geocode'
import { reposicionarPorAncoras } from '@/lib/kpi-romaneio/geocode-ancoras'
import { buscarAlvosDoDia, buscarParadasDoDia, resolverParadas } from '@/lib/kpi-romaneio/unitrac'
import { buscarHorariosBase, anexarCoordenadaCadastro } from '@/lib/kpi-romaneio/base-horarios'
import { ajustarChegadaAposUltimaEntrega } from '@/lib/kpi-romaneio/fim-rota'
import { alvosDaData } from '@/lib/kpi-romaneio/alvos-data'
import { alvosEfetivos } from '@/lib/kpi-romaneio/alvos-snapshot'
import { paradasEfetivas } from '@/lib/kpi-romaneio/paradas-snapshot'
import { detectarDescasamentos } from '@/lib/kpi-romaneio/avisos'
import { montarVisitas } from '@/lib/kpi-romaneio/visitas'
import { agregarPorCarga, montarDetalheEntregas } from '@/lib/kpi-romaneio/agregacao'
import { calcularKmPercorrido } from '@/lib/kpi-romaneio/km'
import { gerarKpiRomaneioXlsx } from '@/lib/kpi-romaneio/gerador-xlsx'
import { salvarGeracao, buscarGeracaoParaRegenerar } from '@/lib/kpi-romaneio/historico'
import { createServiceClient } from '@/lib/supabase/service'
import { COD_USER_NUTRIMAX, EMPRESA_NUTRIMAX, foraDoAlcanceApi, LIMITE_CONCORRENCIA_PLACAS, PAO_PREFIXO } from '@/lib/kpi-romaneio/constants'
import { mapComLimite } from '@/lib/kpi-romaneio/concorrencia'
import { buscarResolucoes, aplicarResolucoes } from '@/lib/kpi-romaneio/resolucoes'
import { buscarPlacasSemRastreador, placasSemRastreadorNoDia, montarTemRastreadorPorPlaca } from '@/lib/kpi-romaneio/placas-sem-rastreador'
import { logarNfDuplicadaNaMesmaPlaca } from '@/lib/kpi-romaneio/nf-duplicada'
import type { LinhaGeocodificada, LinhaKpiRomaneio, LinhaDetalheEntrega, Visita } from '@/lib/kpi-romaneio/types'

export const runtime = 'nodejs'
// A busca de paradas GPS é sequencial por placa (buscarStopsCru + geocode em
// lote) -- um dia com muitas placas pode passar do default de 10s da Vercel.
export const maxDuration = 60

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

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const perfil = await getPerfil(user.id)
  // Geração de KPI é admin-only em todo o sistema (mesma regra do
  // /api/kpi/simples da Benassi) — Nutry Max ainda não tem tela de leitura
  // pra gerente/visualizador, então não há caso de uso pra liberar geração
  // pra eles hoje.
  if (perfil.papel !== 'admin' || !empresaLiberada(perfil, 'nutrimax')) {
    return new NextResponse('Sem permissão.', { status: 403 })
  }

  const form = await req.formData()
  // Pedido do usuario 01/09 ("quero um historico das geracoes... pra
  // gente poder sempre regerar"): regenerarDeId pula o upload de arquivo
  // -- baixa os PDFs originais (Escala + Romaneio) ja guardados no
  // Storage da geracao passada e roda a MESMA pipeline de novo, se
  // beneficiando de qualquer fix aplicado desde entao. Geracao antiga
  // (antes desta mudanca, sem os PDFs guardados) nao pode ser regenerada
  // -- so' as novas, a partir de agora.
  const regenerarDeId = form.get('regenerarDeId')
  let data: string
  // Achado 10/09 (pedido do usuario "so com romaneio da pra fazer o kpi?"):
  // Escala virou OPCIONAL -- null daqui pra baixo significa "nao veio",
  // nunca "arquivo vazio". Unica perda real e' PESO (KG), que nao existe em
  // nenhum outro lugar (nem no Romaneio, nem na Unitrac -- conferido nos 3
  // endpoints, ela e' so' rastreamento GPS, nao tem dado de carga/peso).
  // Todo o resto (motorista/destino/ajudantes/clientes planejados) ja cai
  // pro proprio Romaneio -- ver fallback em agregarPorCarga.
  let escalaBuf: Buffer | null
  let romaneioBuf: Buffer
  // Romaneio do Pão (pedido da Erica 15/09, ver spec
  // 2026-09-15-motor-confirmacao-romaneio-pao) -- OPCIONAL, igual Escala.
  // Só existe no branch de upload novo: `regenerarDeId` (baixa PDFs
  // antigos do Storage) não guarda o pão, então regenerar uma geração
  // antiga sai igual a antes, sem o pão (fora do escopo desta fase).
  let romaneioPaoBuf: Buffer | null = null
  let escalaStoragePathExistente: string | null = null
  let romaneioStoragePathExistente: string | null = null

  if (typeof regenerarDeId === 'string' && regenerarDeId) {
    const geracao = await buscarGeracaoParaRegenerar(regenerarDeId)
    if (!geracao) {
      return new NextResponse('Geração não encontrada.', { status: 404 })
    }
    if (!geracao.romaneioStoragePath) {
      return new NextResponse('Esta geração é anterior ao recurso de regenerar — não guardou os PDFs originais.', { status: 422 })
    }
    data = geracao.dataReferencia
    const svc = createServiceClient()
    const [escalaDl, romaneioDl] = await Promise.all([
      geracao.escalaStoragePath ? svc.storage.from('kpi-romaneio-inputs').download(geracao.escalaStoragePath) : Promise.resolve(null),
      svc.storage.from('kpi-romaneio-inputs').download(geracao.romaneioStoragePath),
    ])
    if ((escalaDl && (escalaDl.error || !escalaDl.data)) || romaneioDl.error || !romaneioDl.data) {
      return new NextResponse('Erro ao baixar os PDFs originais do Storage — arquivo pode ter sido removido.', { status: 500 })
    }
    escalaBuf = escalaDl ? Buffer.from(await escalaDl.data.arrayBuffer()) : null
    romaneioBuf = Buffer.from(await romaneioDl.data.arrayBuffer())
    escalaStoragePathExistente = geracao.escalaStoragePath
    romaneioStoragePathExistente = geracao.romaneioStoragePath
  } else {
    data = String(form.get('data') ?? '')
    const escalaFile = form.get('escala')
    const romaneioFile = form.get('romaneio')

    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      return new NextResponse('Data inválida (YYYY-MM-DD)', { status: 400 })
    }
    if (!(romaneioFile instanceof File)) {
      return new NextResponse('Romaneio de Entrega (PDF) obrigatório', { status: 400 })
    }

    ;[escalaBuf, romaneioBuf] = await Promise.all([
      escalaFile instanceof File ? escalaFile.arrayBuffer().then(b => Buffer.from(b)) : Promise.resolve(null),
      romaneioFile.arrayBuffer().then(b => Buffer.from(b)),
    ])

    const romaneioPaoFile = form.get('romaneioPao')
    romaneioPaoBuf = romaneioPaoFile instanceof File ? Buffer.from(await romaneioPaoFile.arrayBuffer()) : null
  }

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

  // Fix (revisao final de branch 15/09, Important 3): parsePao lanca erros
  // com mensagem escrita PRO OPERADOR ("Romaneio do Pão é do dia X, mas o
  // relatório pedido é de Y") -- sem este try/catch virava 500 generico e o
  // painel mostrava "Internal Server Error", pior que o padrao 4xx +
  // err.message usado no resto deste arquivo.
  let escala: Awaited<ReturnType<typeof parseEscala>>
  let romaneio: Awaited<ReturnType<typeof parseRomaneio>>
  let resultadoPao: Awaited<ReturnType<typeof parsePao>>
  try {
    ;[escala, romaneio, resultadoPao] = await Promise.all([
      escalaBuf ? parseEscala(escalaBuf) : Promise.resolve([]),
      parseRomaneio(romaneioBuf),
      romaneioPaoBuf ? parsePao(romaneioPaoBuf, data) : Promise.resolve({ linhas: [], escala: [] }),
    ])
  } catch (err) {
    return new NextResponse(err instanceof Error ? err.message : 'Erro ao ler os PDFs enviados.', { status: 422 })
  }
  const escalaCompleta = [...escala, ...resultadoPao.escala]
  const romaneioCompleto = [...romaneio, ...resultadoPao.linhas]

  // Fix (revisao final de branch 15/09, Important 4): esta guarda e' sobre o
  // Romaneio de Entrega DA NUTRY MAX especificamente (o unico documento
  // obrigatorio). Checar `romaneioCompleto` deixava um romaneio principal
  // totalmente irreconhecivel passar em silencio so' porque o pao trouxe
  // alguma linha -- exatamente o caso em que o operador mais precisa do
  // aviso. Continua valendo mesmo com o pao enviado.
  if (romaneio.length === 0) {
    return new NextResponse(
      'Nenhuma linha reconhecida no Romaneio de Entrega — confira se o PDF é o "Romaneio de Entrega" da Nutry Max.',
      { status: 422 },
    )
  }

  // Geocodifica todos os endereços únicos do dia numa única chamada em
  // lote -- eficiência e respeito ao rate-limit da cascata do lado do
  // monitoramento (ver src/lib/kpi-romaneio/geocode.ts).
  const enderecosUnicos = [...new Set(romaneioCompleto.map(l => l.endereco))]
  const resultadosGeo = await geocodificarEnderecos(enderecosUnicos, { validarTerritorio: true })
  const geoPorEndereco = new Map(enderecosUnicos.map((e, i) => [e, resultadosGeo[i]]))

  const romaneioGeo: LinhaGeocodificada[] = romaneioCompleto.map(l => {
    const g = geoPorEndereco.get(l.endereco) ?? null
    return { ...l, lat: g?.lat ?? null, lng: g?.lng ?? null, geoConfiavel: g?.confiavel ?? true, geoMotivo: narrowGeoMotivo(g?.motivo) }
  })

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
  const enderecosColididos = new Set<string>()
  {
    const enderecosPorCoord = new Map<string, Set<string>>()
    for (const [endereco, g] of geoPorEndereco) {
      if (!g) continue
      const chave = `${g.lat},${g.lng}`
      const set = enderecosPorCoord.get(chave) ?? new Set<string>()
      set.add(endereco)
      enderecosPorCoord.set(chave, set)
    }
    for (const enderecos of enderecosPorCoord.values()) {
      if (enderecos.size > 1) for (const e of enderecos) enderecosColididos.add(e)
    }
  }

  const indicePorNf = new Map(romaneioGeo.map((l, i) => [l.nf, i]))
  const precisaResgatePorPlaca = agrupar(
    romaneioGeo.filter(l => l.lat == null || enderecosColididos.has(l.endereco)),
    l => normPlaca(l.placa),
  )
  if (precisaResgatePorPlaca.size > 0) {
    const gruposAncoras = [...precisaResgatePorPlaca.entries()].map(([placaNorm, linhas]) => ({
      id: placaNorm,
      ruas: linhas.map(l => l.endereco),
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
    buscarAlvosDoDia(placasNorm),
  ])
  const alvos = await alvosEfetivos('nutrimax', data, hojeBR(), alvosDaData(alvosBrutos, data))
  // Achado real 14/09: pede paradas SEMPRE agora, nao so' fora da janela
  // -- a ponte virou fonte primaria (ver resolverParadas em unitrac.ts).
  const horarioBasePorPlaca = await buscarHorariosBase(placasNorm, data, anexarCoordenadaCadastro(pontosPorPlacaBridge, alvos), true)
  const cvPorPlaca = new Map(frota.map(v => [v.placaNorm, v.cv]))
  // Pedido do usuário 25/08 (nível Benassi): placa sem cv na Unitrac E sem
  // entrada na ponte do monitoramento (nunca respondeu por ela, nem com
  // null) não teve NENHUMA fonte de rastreamento no dia -- ver
  // gerador-xlsx.ts/motivoAusencia.
  // Task 8 (24/09): declaração manual da operação (TTL5J17: tem cv e a
  // ponte respondeu, mas é caminhão sem rastreador de verdade) vence as
  // duas fontes acima -- ver placas-sem-rastreador.ts.
  const placasSemRastreador = placasSemRastreadorNoDia(await buscarPlacasSemRastreador(EMPRESA_NUTRIMAX), data)
  const temRastreadorPorPlaca = montarTemRastreadorPorPlaca(placasNorm, cvPorPlaca, horarioBasePorPlaca, placasSemRastreador)

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
  const daUnitracPorPlaca = new Map<string, UnitracParadaRow[]>()
  await mapComLimite(placasNorm, LIMITE_CONCORRENCIA_PLACAS, async placaNorm => {
    const cv = cvPorPlaca.get(placaNorm)
    daUnitracPorPlaca.set(placaNorm, cv ? await buscarParadasDoDia(cv, placaNorm, data, 48) : [])
  })
  // Achado real 25/09 (RQQ5B81/NF 2386225 23/09): fora da janela de 48h, o
  // feed da Unitrac so' cobre o dia inteiro se o snapshot tinha a placa --
  // senao e' retalho e nao pode vencer a ponte (ver resolverParadas).
  const placasNoSnapshot = new Set<string>()
  const unitracCobreODia = (placaNorm: string) => !foraDaJanelaUnitrac || placasNoSnapshot.has(placaNorm)
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
  const placasFrotaExtra = frota.map(v => v.placaNorm).filter(p => !paradasPorPlaca.has(p))
  const daUnitracExtraPorPlaca = new Map<string, UnitracParadaRow[]>()
  await mapComLimite(placasFrotaExtra, LIMITE_CONCORRENCIA_PLACAS, async placaNorm => {
    const cv = cvPorPlaca.get(placaNorm)
    daUnitracExtraPorPlaca.set(placaNorm, cv ? await buscarParadasDoDia(cv, placaNorm, data, 48) : [])
  })
  const paradasEfetivasExtraPorPlaca = await paradasEfetivas('nutrimax', data, hojeBR(), daUnitracExtraPorPlaca, placasNoSnapshot)
  for (const placaNorm of placasFrotaExtra) {
    const daUnitrac = paradasEfetivasExtraPorPlaca.get(placaNorm) ?? []
    const daPonte = horarioBasePorPlaca.get(placaNorm)?.paradas
    paradasPorPlaca.set(placaNorm, resolverParadas(daUnitrac, daPonte, placaNorm, horarioBasePorPlaca.get(placaNorm)?.apagaoDeSinal ?? false, unitracCobreODia(placaNorm)))
  }

  const alvosPorPlaca = agrupar(alvos, a => a.placaNorm)

  // Achado real 22/09 (RBG5G18 21/09): quando a ULTIMA volta a base
  // registrada e' na verdade uma volta extra sem entrega (fim da rota --
  // ultima saida com entrega -- veio bem antes dela), CHEGADA CD tem que
  // ser a PRIMEIRA volta a base depois disso, nao a ultima do dia. Muta
  // horarioBasePorPlaca in-place antes de virar chegadaCd em agregarPorCarga.
  // Ruling do controller (revisao final 22/09): so' ajusta quando TODAS as
  // NFs do romaneio da placa (linhasPorPlaca) ja' estao confirmadas.
  const nfsPorPlaca = new Map([...linhasPorPlaca].map(([p, linhas]) => [p, linhas.map(l => l.nf)]))
  await ajustarChegadaAposUltimaEntrega(placasNorm, data, horarioBasePorPlaca, visitasPorPlaca, alvosPorPlaca, nfsPorPlaca)

  // Cargas vêm do Romaneio -- é a fonte de verdade de quantas cargas
  // existiram no dia. A Escala só complementa (destino/motorista/peso/
  // planejado) quando há correspondência por carga+placa.
  const escalaPorChave = new Map(escalaCompleta.map(e => [`${e.carga}::${e.placaNorm}`, e]))
  const cargasPorChave = agrupar(romaneioGeo, l => `${l.carga}::${normPlaca(l.placa)}`)

  const linhasKpi: LinhaKpiRomaneio[] = [...cargasPorChave.entries()]
    .map(([chave, linhasDaCarga]) => {
      const [carga, placaNorm] = chave.split('::')
      return agregarPorCarga(
        carga,
        placaNorm,
        linhasDaCarga,
        escalaPorChave.get(chave) ?? null,
        alvosPorPlaca.get(placaNorm) ?? [],
        visitasPorPlaca.get(placaNorm) ?? new Map(),
        paradasPorPlaca.get(placaNorm) ?? [],
        kmPorPlaca.get(placaNorm) ?? null,
        horarioBasePorPlaca.get(placaNorm),
        temRastreadorPorPlaca.get(placaNorm) ?? false,
      )
    })
    .sort((a, b) => a.carga.localeCompare(b.carga) || a.placa.localeCompare(b.placa))

  // resumoPorChave (pedido do usuario 25/08): montarDetalheEntregas repete
  // motorista/saidaCd/chegadaCd/tempoOperacaoMin da carga inteira em toda
  // linha de NF -- mesma chave carga+placa usada pra montar linhasKpi acima.
  const resumoPorChave = new Map(linhasKpi.map(l => [`${l.carga}::${l.placa}`, l]))

  // Aba "Detalhamento" (pedido do usuário 24/08): uma linha por NF/entrega,
  // não só o resumo por carga -- mesma fonte de dado (linhasDaCarga/alvos/
  // visitas) já calculada acima pra agregarPorCarga, só que sem agregar.
  const detalhe: LinhaDetalheEntrega[] = [...cargasPorChave.entries()]
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
        // Ver comentario de diaEmAndamento em agregacao.ts: so' "em
        // andamento" quando o relatorio e' de HOJE e essa rota especifica
        // ainda nao retornou pra base (chegadaCd null) -- dia passado com
        // chegadaCd null e' outra coisa (rota que genuinamente nunca voltou),
        // nao deve virar "aguardando".
        data === hojeBR() && (resumo?.chegadaCd ?? null) == null,
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
      )
    })
    .sort((a, b) => a.carga.localeCompare(b.carga) || a.placa.localeCompare(b.placa) || a.nf.localeCompare(b.nf))

  // Aviso agregado de descasamento Escala<->Romaneio (ver spec, secao
  // "Tratamento de erro/ambiguidade") -- aditivo, nunca bloqueia o resto do
  // relatorio. Usa a MESMA chave carga+placa ja calculada acima.
  const cargasRomaneioList = [...cargasPorChave.keys()].map(chave => {
    const [carga, placaNorm] = chave.split('::')
    return { carga, placaNorm }
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
    ...(escalaBuf ? detectarDescasamentos(escala, cargasRomaneioList.filter(c => !ehCargaPao(c.carga))) : []),
    ...(romaneioPaoBuf ? detectarDescasamentos(resultadoPao.escala, cargasRomaneioList.filter(c => ehCargaPao(c.carga))) : []),
  ].sort((a, b) => a.carga.localeCompare(b.carga) || a.placa.localeCompare(b.placa))

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

  const xlsxBuf = await gerarKpiRomaneioXlsx(linhasKpi, data, avisos, detalheComResolucao, undefined, undefined, {
    // Linha de resumo (taxa automatica/apos conferencia) so' na Nutry Max --
    // ver `opcoes.resumoConfirmacao` em gerador-xlsx.ts.
    resumoConfirmacao: true,
  })

  // Registra a geração no histórico (auditoria simples) + guarda os PDFs
  // originais no Storage (pedido do usuario 01/09, ver comentario da
  // migration) pra viabilizar "regenerar" depois. Reusa o path existente
  // quando esta chamada JA'  E' uma regeneracao (os PDFs sao os mesmos,
  // nao faz sentido duplicar no Storage) -- so' faz upload novo na
  // geracao original.
  // Falha ao salvar NUNCA deve derrubar a geração do arquivo -- xlsx ja'
  // esta pronto, o usuario nao pode ficar sem o download por causa disso.
  try {
    const svc = createServiceClient()
    let escalaStoragePath = escalaStoragePathExistente
    let romaneioStoragePath = romaneioStoragePathExistente
    if (!romaneioStoragePath) {
      const prefixo = `nutrimax/${data}/${crypto.randomUUID()}`
      romaneioStoragePath = `${prefixo}-romaneio.pdf`
      const uploads = [svc.storage.from('kpi-romaneio-inputs').upload(romaneioStoragePath, romaneioBuf, { contentType: 'application/pdf' })]
      // Escala e' opcional -- so' faz upload dela se de fato veio.
      if (escalaBuf && !escalaStoragePath) {
        escalaStoragePath = `${prefixo}-escala.pdf`
        uploads.push(svc.storage.from('kpi-romaneio-inputs').upload(escalaStoragePath, escalaBuf, { contentType: 'application/pdf' }))
      }
      const resultados = await Promise.all(uploads)
      if (resultados.some(r => r.error)) {
        console.error('Erro ao guardar PDFs originais no Storage:', resultados.map(r => r.error?.message).filter(Boolean).join('; '))
        escalaStoragePath = null
        romaneioStoragePath = null
      }
    }

    await salvarGeracao({
      cliente: 'nutrimax',
      dataReferencia: data,
      geradoPor: user?.email ?? null,
      qtdCargas: linhasKpi.filter(l => !l.carga.startsWith(PAO_PREFIXO)).length,
      arquivoStoragePath: null,
      escalaStoragePath,
      romaneioStoragePath,
    })
  } catch (err) {
    console.error('Erro ao salvar histórico de geração:', err)
  }

  return new NextResponse(xlsxBuf as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="KPI-Nutry-Max-${data}.xlsx"`,
    },
  })
}
