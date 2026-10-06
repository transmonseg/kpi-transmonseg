import { NextRequest, NextResponse } from 'next/server'
import { hojeBR } from '@/lib/data-br'
import { createServiceClient } from '@/lib/supabase/service'
import { gerarKpiNutrimax } from '@/lib/kpi-romaneio/gerar-nutrimax'
import { entradaDoDia } from '@/lib/kpi-romaneio/ao-vivo-servico'
import { extrairResumoKpiXlsx } from '@/lib/kpi-romaneio/resumo-dashboard'
import { salvarGeracao } from '@/lib/kpi-romaneio/historico'
import { guardarXlsxGerado, novoPrefixoGeracao } from '@/lib/kpi-romaneio/xlsx-gerado'
import { acessoAoVivo } from '../acesso'

export const runtime = 'nodejs'

// "Gerar KPI agora": a MESMA geração da tela Gerar KPI, com o romaneio do dia
// já guardado (sem subir arquivo). Calcula na hora — não reaproveita o último
// cálculo da tela — e entra no histórico como qualquer geração.
export async function POST(req: NextRequest) {
  const a = await acessoAoVivo(req.nextUrl.searchParams.get('cliente'))
  if (!a.ok) return a.resp
  const data = hojeBR()
  const entrada = await entradaDoDia(a.cliente, data)
  if (!entrada) return new NextResponse('Suba o romaneio do dia primeiro.', { status: 409 })
  const r = await gerarKpiNutrimax(entrada)
  try {
    const svc = createServiceClient()
    const arquivoStoragePath = await guardarXlsxGerado(svc, novoPrefixoGeracao('nutrimax', data), r.xlsx)
    let resumo = null
    try { resumo = await extrairResumoKpiXlsx(r.xlsx) } catch (err) { console.error('resumo do dashboard falhou:', err) }
    await salvarGeracao({ cliente: 'nutrimax', dataReferencia: data, geradoPor: a.email, qtdCargas: r.qtdCargasNutry, arquivoStoragePath, escalaStoragePath: null, romaneioStoragePath: null, resumo })
  } catch (err) {
    console.error('Erro ao salvar histórico da geração ao vivo:', err)
  }
  return new NextResponse(r.xlsx as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="KPI-Nutry-Max-${data}.xlsx"`,
    },
  })
}
