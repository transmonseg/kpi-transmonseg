import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPerfil, empresaLiberada } from '@/lib/perfil'
import { buscarFrota, normPlaca } from '@/lib/unitrac-api'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import { hojeBR } from '@/lib/data-br'
import { parseEscala } from '@/lib/kpi-romaneio/parse-escala'
import { parseRomaneio } from '@/lib/kpi-romaneio/parse-romaneio'
import { geocodificarEnderecos } from '@/lib/kpi-romaneio/geocode'
import { buscarAlvosDoDia, buscarParadasDoDia, resolverParadas } from '@/lib/kpi-romaneio/unitrac'
import { buscarHorariosBase } from '@/lib/kpi-romaneio/base-horarios'
import { alvosDaData } from '@/lib/kpi-romaneio/alvos-data'
import { detectarDescasamentos } from '@/lib/kpi-romaneio/avisos'
import { montarVisitas } from '@/lib/kpi-romaneio/visitas'
import { agregarPorCarga, montarDetalheEntregas } from '@/lib/kpi-romaneio/agregacao'
import { calcularKmPercorrido } from '@/lib/kpi-romaneio/km'
import { gerarKpiRomaneioXlsx } from '@/lib/kpi-romaneio/gerador-xlsx'
import { salvarGeracao, buscarGeracaoParaRegenerar } from '@/lib/kpi-romaneio/historico'
import { createServiceClient } from '@/lib/supabase/service'
import { COD_USER_NUTRIMAX, foraDoAlcanceApi } from '@/lib/kpi-romaneio/constants'
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

  const [escala, romaneio] = await Promise.all([
    escalaBuf ? parseEscala(escalaBuf) : Promise.resolve([]),
    parseRomaneio(romaneioBuf),
  ])

  if (romaneio.length === 0) {
    return new NextResponse(
      'Nenhuma linha reconhecida no Romaneio de Entrega — confira se o PDF é o "Romaneio de Entrega" da Nutry Max.',
      { status: 422 },
    )
  }

  // Geocodifica todos os endereços únicos do dia numa única chamada em
  // lote -- eficiência e respeito ao rate-limit da cascata do lado do
  // monitoramento (ver src/lib/kpi-romaneio/geocode.ts).
  const enderecosUnicos = [...new Set(romaneio.map(l => l.endereco))]
  const resultadosGeo = await geocodificarEnderecos(enderecosUnicos, { validarTerritorio: true })
  const geoPorEndereco = new Map(enderecosUnicos.map((e, i) => [e, resultadosGeo[i]]))

  const romaneioGeo: LinhaGeocodificada[] = romaneio.map(l => {
    const g = geoPorEndereco.get(l.endereco) ?? null
    return { ...l, lat: g?.lat ?? null, lng: g?.lng ?? null, geoConfiavel: g?.confiavel ?? true, geoMotivo: narrowGeoMotivo(g?.motivo) }
  })

  const linhasPorPlaca = agrupar(romaneioGeo, l => normPlaca(l.placa))
  const placasNorm = [...linhasPorPlaca.keys()]

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

  const [frota, alvosBrutos, horarioBasePorPlaca] = await Promise.all([
    buscarFrota(COD_USER_NUTRIMAX),
    buscarAlvosDoDia(placasNorm),
    // Dia fora da janela de 48h da Unitrac: pede tambem as paradas
    // derivadas do historico permanente do monitoramento (ver
    // paradasDaPonte / derivarParadas). Dentro da janela nao pede -- o
    // feed da Unitrac ja' cobre e o payload fica menor.
    buscarHorariosBase(placasNorm, data, pontosPorPlacaBridge, foraDaJanelaUnitrac),
  ])
  const alvos = alvosDaData(alvosBrutos, data)
  const cvPorPlaca = new Map(frota.map(v => [v.placaNorm, v.cv]))
  // Pedido do usuário 25/08 (nível Benassi): placa sem cv na Unitrac E sem
  // entrada na ponte do monitoramento (nunca respondeu por ela, nem com
  // null) não teve NENHUMA fonte de rastreamento no dia -- ver
  // gerador-xlsx.ts/motivoAusencia.
  const temRastreadorPorPlaca = new Map(placasNorm.map(p => [p, cvPorPlaca.has(p) || horarioBasePorPlaca.has(p)]))

  // Por placa (não por carga -- as paradas GPS do dia cobrem a placa
  // inteira, independente de quantas cargas ela rodou): busca paradas,
  // monta visitas por perímetro próprio e calcula km percorrido. Placa sem
  // correspondência na frota (sem cv) fica sem GPS -- confirmação ainda
  // pode vir só do alvo Unitrac (situacao===1), sem bloquear a carga.
  const paradasPorPlaca = new Map<string, UnitracParadaRow[]>()
  const visitasPorPlaca = new Map<string, Map<string, Visita>>()
  const kmPorPlaca = new Map<string, number | null>()

  await Promise.all(placasNorm.map(async placaNorm => {
    const cv = cvPorPlaca.get(placaNorm)
    const daUnitrac = cv ? await buscarParadasDoDia(cv, placaNorm, data, 48) : []
    // Sem parada nenhuma da Unitrac (dia fora das 48h, ou placa sem cv) mas
    // com parada derivada do historico permanente: usa a da ponte.
    const daPonte = horarioBasePorPlaca.get(placaNorm)?.paradas
    const paradas = resolverParadas(daUnitrac, daPonte, placaNorm, foraDaJanelaUnitrac)
    paradasPorPlaca.set(placaNorm, paradas)
    visitasPorPlaca.set(placaNorm, montarVisitas(linhasPorPlaca.get(placaNorm) ?? [], paradas, horarioBasePorPlaca.get(placaNorm)?.visitasPorNf))
    kmPorPlaca.set(placaNorm, calcularKmPercorrido(paradas))
  }))

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
  await Promise.all(placasFrotaExtra.map(async placaNorm => {
    const cv = cvPorPlaca.get(placaNorm)
    const daUnitrac = cv ? await buscarParadasDoDia(cv, placaNorm, data, 48) : []
    const daPonte = horarioBasePorPlaca.get(placaNorm)?.paradas
    paradasPorPlaca.set(placaNorm, resolverParadas(daUnitrac, daPonte, placaNorm, foraDaJanelaUnitrac))
  }))

  const alvosPorPlaca = agrupar(alvos, a => a.placaNorm)

  // Cargas vêm do Romaneio -- é a fonte de verdade de quantas cargas
  // existiram no dia. A Escala só complementa (destino/motorista/peso/
  // planejado) quando há correspondência por carga+placa.
  const escalaPorChave = new Map(escala.map(e => [`${e.carga}::${e.placaNorm}`, e]))
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
  const avisos = escalaBuf ? detectarDescasamentos(escala, cargasRomaneioList) : []

  const xlsxBuf = await gerarKpiRomaneioXlsx(linhasKpi, data, avisos, detalhe)

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
      qtdCargas: linhasKpi.length,
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
