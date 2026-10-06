import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPerfil, podeOperarEmpresa } from '@/lib/perfil'
import { parseEscala } from '@/lib/kpi-romaneio/parse-escala'
import { parseRomaneio } from '@/lib/kpi-romaneio/parse-romaneio'
import { parsePao } from '@/lib/kpi-romaneio/parse-pao'
import { extrairResumoKpiXlsx } from '@/lib/kpi-romaneio/resumo-dashboard'
import { salvarGeracao, buscarGeracaoParaRegenerar } from '@/lib/kpi-romaneio/historico'
import { guardarXlsxGerado, novoPrefixoGeracao } from '@/lib/kpi-romaneio/xlsx-gerado'
import { createServiceClient } from '@/lib/supabase/service'
import { gerarKpiNutrimax, ErroEntradaKpi } from '@/lib/kpi-romaneio/gerar-nutrimax'
import { createHash } from 'node:crypto'
import { lerCacheDia, gravarCacheDia } from '@/lib/kpi-romaneio/cache-dia'
import { guardarEntradaNutrimax, lerEntradaGuardadaNutrimax } from '@/lib/kpi-romaneio/entrada-guardada'
import { hojeBR } from '@/lib/data-br'

// Leitura de PDF guardada pelo conteúdo (06/10): mesmo arquivo de novo não é
// lido de novo. Trocar VERSAO_LEITURA quando um parser mudar.
const VERSAO_LEITURA = '2026-10-06'
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex').slice(0, 24)
async function lerComCache<T>(data: string, tipo: string, buf: Buffer, ler: () => Promise<T>): Promise<T> {
  const chave = `${tipo}:${sha(buf)}:${VERSAO_LEITURA}`
  const c = (await lerCacheDia<T>('pdf', data, hojeBR(), 24 * 3600_000)).get(chave)
  if (c) return c
  const v = await ler()
  await gravarCacheDia('pdf', data, new Map([[chave, v]]))
  return v
}
/** PDF guardado uma vez só por conteúdo (06/10): gerar de novo com o mesmo
 *  arquivo não ocupa mais espaço. */
async function guardarPdf(svc: ReturnType<typeof createServiceClient>, data: string, tipo: string, buf: Buffer): Promise<string | null> {
  const caminho = `nutrimax/${data}/entrada-${sha(buf)}-${tipo}.pdf`
  const r = await svc.storage.from('kpi-romaneio-inputs').upload(caminho, buf, { contentType: 'application/pdf', upsert: true })
  if (r.error) { console.error(`Erro ao guardar PDF ${tipo}:`, r.error.message); return null }
  return caminho
}


export const runtime = 'nodejs'
// A busca de paradas GPS é sequencial por placa (buscarStopsCru + geocode em
// lote) -- um dia com muitas placas pode passar do default de 10s da Vercel.
export const maxDuration = 60

// narrowGeoMotivo mora em gerar-nutrimax.ts (06/10); reexportado pros testes.
export { narrowGeoMotivo } from '@/lib/kpi-romaneio/gerar-nutrimax'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const perfil = await getPerfil(user.id)
  // Geração de KPI: admin, ou operador com a empresa liberada no perfil
  // (04/10). Gerente/visualizador seguem só leitura.
  if (!podeOperarEmpresa(perfil, 'nutrimax')) {
    return new NextResponse('Sem permissão.', { status: 403 })
  }

  const form = await req.formData()

  // Romaneio do dia já guardado (Ao vivo ou geração anterior): sem subir nem
  // ler os PDFs de novo (06/10).
  if (form.get('usarGuardado') === '1') {
    const dataG = String(form.get('data') ?? '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataG)) return new NextResponse('Data inválida (YYYY-MM-DD)', { status: 400 })
    const g = await lerEntradaGuardadaNutrimax(dataG)
    if (!g) return new NextResponse('Não há romaneio guardado desse dia — suba os PDFs.', { status: 404 })
    let r: Awaited<ReturnType<typeof gerarKpiNutrimax>>
    try { r = await gerarKpiNutrimax(g.entrada) } catch (err) {
      if (err instanceof ErroEntradaKpi) return new NextResponse(err.message, { status: 422 })
      throw err
    }
    try {
      const svc = createServiceClient()
      const arquivoStoragePath = await guardarXlsxGerado(svc, novoPrefixoGeracao('nutrimax', dataG), r.xlsx)
      let resumo = null
      try { resumo = await extrairResumoKpiXlsx(r.xlsx) } catch (err) { console.error('resumo do dashboard falhou:', err) }
      await salvarGeracao({ cliente: 'nutrimax', dataReferencia: dataG, geradoPor: user?.email ?? null, qtdCargas: r.qtdCargasNutry, arquivoStoragePath, escalaStoragePath: null, romaneioStoragePath: null, paoStoragePath: null, resumo })
    } catch (err) { console.error('Erro ao salvar histórico de geração:', err) }
    return new NextResponse(r.xlsx as unknown as BodyInit, { headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="KPI-Nutry-Max-${dataG}.xlsx"`,
    } })
  }
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
  // antiga sai igual a antes, sem o pão; gerações novas guardam o Pão
  // (pao_storage_path) e regeneram completas.
  let romaneioPaoBuf: Buffer | null = null
  let escalaStoragePathExistente: string | null = null
  let romaneioStoragePathExistente: string | null = null
  let paoStoragePathExistente: string | null = null

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
    // Pão guardado (migration 20260929000000): baixa e usa. Falha no
    // download regenera sem Pão, com aviso -- nunca derruba a regeneração.
    if (geracao.paoStoragePath) {
      try {
        const paoDl = await svc.storage.from('kpi-romaneio-inputs').download(geracao.paoStoragePath)
        if (paoDl.error || !paoDl.data) {
          console.warn(`Aviso: PDF do Pão guardado não pôde ser baixado (${geracao.paoStoragePath}); regenerando sem o Pão.`, paoDl.error?.message ?? 'sem dados')
        } else {
          romaneioPaoBuf = Buffer.from(await paoDl.data.arrayBuffer())
          paoStoragePathExistente = geracao.paoStoragePath
        }
      } catch (err) {
        console.warn(`Aviso: erro ao baixar o PDF do Pão (${geracao.paoStoragePath}); regenerando sem o Pão.`, err)
      }
    }
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
      escalaBuf ? lerComCache(data, 'escala', escalaBuf, () => parseEscala(escalaBuf!)) : Promise.resolve([]),
      lerComCache(data, 'romaneio', romaneioBuf, () => parseRomaneio(romaneioBuf)),
      romaneioPaoBuf ? lerComCache(data, `pao-${data}`, romaneioPaoBuf, () => parsePao(romaneioPaoBuf!, data)) : Promise.resolve({ linhas: [], escala: [] }),
    ])
  } catch (err) {
    return new NextResponse(err instanceof Error ? err.message : 'Erro ao ler os PDFs enviados.', { status: 422 })
  }

  // O que foi lido fica guardado 7 dias: a próxima geração do dia não precisa
  // subir os PDFs (tela Gerar KPI mostra "já guardado").
  await guardarEntradaNutrimax({ data, escala, romaneio, pao: resultadoPao, escalaEnviada: escalaBuf != null, paoEnviado: romaneioPaoBuf != null })
    .catch(err => console.error('guardar entrada do dia falhou:', err))

  let resultado: Awaited<ReturnType<typeof gerarKpiNutrimax>>
  try {
    resultado = await gerarKpiNutrimax({
      data,
      escala,
      romaneio,
      pao: resultadoPao,
      escalaEnviada: escalaBuf != null,
      paoEnviado: romaneioPaoBuf != null,
    })
  } catch (err) {
    if (err instanceof ErroEntradaKpi) return new NextResponse(err.message, { status: 422 })
    throw err
  }
  const xlsxBuf = resultado.xlsx

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
    let paoStoragePath = paoStoragePathExistente
    // Mesmo prefixo dos inputs na geracao original; na regeneracao (inputs
    // reaproveitados) um prefixo novo, pra nao sobrescrever o xlsx antigo.
    const prefixo = novoPrefixoGeracao('nutrimax', data)
    if (!romaneioStoragePath) {
      romaneioStoragePath = await guardarPdf(svc, data, 'romaneio', romaneioBuf)
      if (escalaBuf && !escalaStoragePath) escalaStoragePath = await guardarPdf(svc, data, 'escala', escalaBuf)
      if (romaneioPaoBuf && !paoStoragePath) paoStoragePath = await guardarPdf(svc, data, 'pao', romaneioPaoBuf)
    }

    const arquivoStoragePath = await guardarXlsxGerado(svc, prefixo, xlsxBuf)

    // Dashboard: resumo lido da propria planilha (falha so' loga).
    let resumo = null
    try { resumo = await extrairResumoKpiXlsx(xlsxBuf) } catch (err) { console.error('resumo do dashboard falhou:', err) }
    await salvarGeracao({
      cliente: 'nutrimax',
      dataReferencia: data,
      geradoPor: user?.email ?? null,
      qtdCargas: resultado.qtdCargasNutry,
      arquivoStoragePath,
      escalaStoragePath,
      romaneioStoragePath,
      paoStoragePath,
      resumo,
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
