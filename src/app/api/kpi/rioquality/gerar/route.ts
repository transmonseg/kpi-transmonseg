import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPerfil, empresaLiberada } from '@/lib/perfil'
import { hojeBR } from '@/lib/data-br'
import { salvarGeracao, buscarGeracaoParaRegenerar } from '@/lib/kpi-romaneio/historico'
import { createServiceClient } from '@/lib/supabase/service'
import { foraDoAlcanceApi } from '@/lib/kpi-romaneio/constants'
import { gerarKpiRioQuality, EntradaInvalidaError } from '@/lib/kpi-rioquality/pipeline'
import { buscarFrotaRioQuality } from '@/lib/kpi-rioquality/frota'

// KPI Rio Quality -- entrada (2 planilhas xlsx) + auth + historico. A pipeline
// em si esta' em src/lib/kpi-rioquality/pipeline.ts (compartilhada com o
// script scripts/gerar-rioquality-real-arquivo.ts). Ver
// docs/plans/2026-09-05-kpi-rio-quality.md.

export const runtime = 'nodejs'
export const maxDuration = 120

const BUCKET = 'kpi-romaneio-inputs'
const CLIENTE = 'rioquality'
const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })
  const perfil = await getPerfil(user.id)
  if (perfil.papel !== 'admin' || !empresaLiberada(perfil, CLIENTE)) {
    return new NextResponse('Sem permissão.', { status: 403 })
  }

  const form = await req.formData()
  const regenerarDeId = form.get('regenerarDeId')
  let data: string
  // Formato ANTIGO (2 planilhas) usa custosBuf+entregasBuf; formato NOVO
  // (achado real 06/09, 1 arquivo unico ja' com cidade/bairro/cliente/
  // motorista) usa so' completaBuf -- ver pipeline.ts. Guardado no Storage
  // reaproveitando as MESMAS colunas escala/romaneio da tabela: formato
  // novo grava so' em romaneioStoragePath (escalaStoragePath fica null),
  // o que tambem serve pra distinguir o formato na hora de regenerar.
  let custosBuf: Buffer | null = null
  let entregasBuf: Buffer | null = null
  let completaBuf: Buffer | null = null
  let custosStoragePathExistente: string | null = null
  let entregasStoragePathExistente: string | null = null

  if (typeof regenerarDeId === 'string' && regenerarDeId) {
    const geracao = await buscarGeracaoParaRegenerar(regenerarDeId)
    if (!geracao) return new NextResponse('Geração não encontrada.', { status: 404 })
    if (!geracao.romaneioStoragePath) {
      return new NextResponse('Esta geração não guardou as planilhas originais.', { status: 422 })
    }
    data = geracao.dataReferencia
    const svc = createServiceClient()
    if (geracao.escalaStoragePath) {
      // reaproveita as colunas escala/romaneio da tabela: escala := Custos, romaneio := Entregas
      const [custosDl, entregasDl] = await Promise.all([
        svc.storage.from(BUCKET).download(geracao.escalaStoragePath),
        svc.storage.from(BUCKET).download(geracao.romaneioStoragePath),
      ])
      if (custosDl.error || !custosDl.data || entregasDl.error || !entregasDl.data) {
        return new NextResponse('Erro ao baixar as planilhas originais do Storage.', { status: 500 })
      }
      custosBuf = Buffer.from(await custosDl.data.arrayBuffer())
      entregasBuf = Buffer.from(await entregasDl.data.arrayBuffer())
      custosStoragePathExistente = geracao.escalaStoragePath
      entregasStoragePathExistente = geracao.romaneioStoragePath
    } else {
      const dl = await svc.storage.from(BUCKET).download(geracao.romaneioStoragePath)
      if (dl.error || !dl.data) return new NextResponse('Erro ao baixar o arquivo original do Storage.', { status: 500 })
      completaBuf = Buffer.from(await dl.data.arrayBuffer())
      entregasStoragePathExistente = geracao.romaneioStoragePath
    }
  } else {
    data = String(form.get('data') ?? '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return new NextResponse('Data inválida (YYYY-MM-DD)', { status: 400 })
    const completaFile = form.get('completo')
    if (completaFile instanceof File) {
      completaBuf = Buffer.from(await completaFile.arrayBuffer())
    } else {
      const custosFile = form.get('custos')
      const entregasFile = form.get('entregas')
      if (!(custosFile instanceof File)) return new NextResponse('Relatório de Custos (xlsx) obrigatório', { status: 400 })
      if (!(entregasFile instanceof File)) return new NextResponse('Relatório de Entregas (xlsx) obrigatório', { status: 400 })
      ;[custosBuf, entregasBuf] = await Promise.all([
        custosFile.arrayBuffer().then(b => Buffer.from(b)),
        entregasFile.arrayBuffer().then(b => Buffer.from(b)),
      ])
    }
  }

  if (foraDoAlcanceApi(data, hojeBR())) {
    return new NextResponse(
      'A API do Unitrac só alcança as últimas 48h (hoje/ontem) — não dá pra gerar KPI de uma data mais antiga.',
      { status: 422 },
    )
  }

  let resultado
  try {
    resultado = completaBuf
      ? await gerarKpiRioQuality({ completaBuf, data, cvPorPlaca: await buscarFrotaRioQuality() })
      : await gerarKpiRioQuality({ custosBuf: custosBuf!, entregasBuf: entregasBuf!, data, cvPorPlaca: await buscarFrotaRioQuality() })
  } catch (e) {
    if (e instanceof EntradaInvalidaError) return new NextResponse(e.message, { status: 422 })
    throw e
  }

  try {
    const svc = createServiceClient()
    let custosStoragePath = custosStoragePathExistente
    let entregasStoragePath = entregasStoragePathExistente
    if (!entregasStoragePath) {
      const prefixo = `${CLIENTE}/${data}/${crypto.randomUUID()}`
      if (completaBuf) {
        entregasStoragePath = `${prefixo}-completo.xlsx`
        const up = await svc.storage.from(BUCKET).upload(entregasStoragePath, completaBuf, { contentType: TIPO_XLSX })
        if (up.error) {
          console.error('Erro ao guardar arquivo original no Storage:', up.error.message)
          entregasStoragePath = null
        }
      } else {
        custosStoragePath = `${prefixo}-custos.xlsx`
        entregasStoragePath = `${prefixo}-entregas.xlsx`
        const [upC, upE] = await Promise.all([
          svc.storage.from(BUCKET).upload(custosStoragePath, custosBuf!, { contentType: TIPO_XLSX }),
          svc.storage.from(BUCKET).upload(entregasStoragePath, entregasBuf!, { contentType: TIPO_XLSX }),
        ])
        if (upC.error || upE.error) {
          console.error('Erro ao guardar planilhas originais no Storage:', upC.error?.message, upE.error?.message)
          custosStoragePath = null
          entregasStoragePath = null
        }
      }
    }
    await salvarGeracao({
      cliente: CLIENTE,
      dataReferencia: data,
      geradoPor: user?.email ?? null,
      qtdCargas: resultado.linhasKpi.length,
      arquivoStoragePath: null,
      escalaStoragePath: custosStoragePath,
      romaneioStoragePath: entregasStoragePath,
    })
  } catch (err) {
    console.error('Erro ao salvar histórico de geração:', err)
  }

  return new NextResponse(resultado.xlsx as unknown as BodyInit, {
    headers: {
      'Content-Type': TIPO_XLSX,
      'Content-Disposition': `attachment; filename="KPI-Rio-Quality-${data}.xlsx"`,
    },
  })
}
