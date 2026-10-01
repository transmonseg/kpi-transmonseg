import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPerfil, empresaLiberada } from '@/lib/perfil'
import { createServiceClient } from '@/lib/supabase/service'
import { BUCKET_KPI_ROMANEIO, TIPO_XLSX } from '@/lib/kpi-romaneio/xlsx-gerado'

// Item 1 (auditoria 01/10): baixa o xlsx GUARDADO de uma geracao passada
// (arquivo_storage_path), sem rodar a pipeline de novo. Mesma regra de
// acesso das rotas gerar: admin + empresa liberada.

export const runtime = 'nodejs'

const NOME_ARQUIVO: Record<string, string> = {
  nutrimax: 'KPI-Nutry-Max',
  rioquality: 'KPI-Rio-Quality',
  portefrio: 'KPI-Portefrio',
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const { id } = await params
  const svc = createServiceClient()
  const { data: row, error } = await svc
    .from('kpi_romaneio_geracoes')
    .select('cliente, data_referencia, arquivo_storage_path')
    .eq('id', id)
    .maybeSingle()
  if (error || !row) return new NextResponse('Geração não encontrada.', { status: 404 })

  const perfil = await getPerfil(user.id)
  if (perfil.papel !== 'admin' || !empresaLiberada(perfil, row.cliente)) {
    return new NextResponse('Sem permissão.', { status: 403 })
  }
  if (!row.arquivo_storage_path) {
    return new NextResponse('Esta geração não guardou o arquivo xlsx.', { status: 404 })
  }

  const dl = await svc.storage.from(BUCKET_KPI_ROMANEIO).download(row.arquivo_storage_path)
  if (dl.error || !dl.data) return new NextResponse('Erro ao baixar o arquivo do Storage.', { status: 500 })

  const nome = `${NOME_ARQUIVO[row.cliente] ?? 'KPI'}-${row.data_referencia}.xlsx`
  return new NextResponse(Buffer.from(await dl.data.arrayBuffer()) as unknown as BodyInit, {
    headers: {
      'Content-Type': TIPO_XLSX,
      'Content-Disposition': `attachment; filename="${nome}"`,
    },
  })
}
