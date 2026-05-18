import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseCozinha, calcularEstatisticas, type ResultadoCozinha } from '@/lib/parsers/cozinha-parser'
import { gerarXlsx } from '@/lib/parsers/xlsx-generator'
import { gerarPdf } from '@/lib/parsers/pdf-generator'
import { gerarRomaneioXlsx, gerarRomaneioPdf } from '@/lib/parsers/romaneio-generator'
import type { ClienteMatriz } from '@/lib/parsers/cozinha-matriz'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return new NextResponse('Não autenticado', { status: 401 })
  }

  const formData = await req.formData()
  const arquivo = formData.get('arquivo')
  const dataRef = String(formData.get('dataRef') ?? '')

  if (!(arquivo instanceof File)) {
    return new NextResponse('Arquivo não enviado.', { status: 400 })
  }

  const nome = arquivo.name
  if (!nome.toLowerCase().endsWith('.xlsx')) {
    return new NextResponse('Envie um arquivo .xlsx.', { status: 400 })
  }

  const arrayBuffer = await arquivo.arrayBuffer()

  // Carrega matriz de clientes do banco (opcional — não bloqueia se ausente)
  let matriz: ClienteMatriz[] | undefined
  try {
    const svc = createServiceClient()
    const { data: rows } = await svc
      .from('clientes_cozinha')
      .select('codigo,filial,nome,fantasia,cnpj,cep,endereco,numero,complemento')
      .order('codigo', { ascending: true })
    if (rows && rows.length > 0) matriz = rows as ClienteMatriz[]
  } catch {
    // matriz ausente — gera sem endereços
  }

  let resultado: ResultadoCozinha
  try {
    resultado = await parseCozinha(arrayBuffer, matriz)
  } catch (e) {
    return new NextResponse(
      e instanceof Error ? e.message : 'Erro ao ler XLSX.',
      { status: 400 }
    )
  }

  const { rotas, declaradas } = resultado

  if (rotas.length === 0) {
    return new NextResponse(
      'Nenhuma rota encontrada. Confirme que o arquivo é da escala Cozinha.',
      { status: 400 }
    )
  }

  const estatisticas = calcularEstatisticas(rotas)
  const dataFormatada = formatarData(dataRef)

  let xlsxBuffer: Buffer, pdfBuffer: Buffer, romaneioXlsxBuffer: Buffer, romaneioPdfBuffer: Buffer
  try {
    ;[xlsxBuffer, pdfBuffer, romaneioXlsxBuffer, romaneioPdfBuffer] = await Promise.all([
      gerarXlsx(rotas, estatisticas, dataFormatada),
      gerarPdf(rotas, estatisticas, dataFormatada),
      gerarRomaneioXlsx(rotas, dataFormatada),
      gerarRomaneioPdf(rotas, dataFormatada),
    ])
  } catch (e) {
    return new NextResponse(
      `Erro ao gerar arquivos: ${e instanceof Error ? e.message : String(e)}`,
      { status: 500 }
    )
  }

  const nomeBase = nome.replace(/\.xlsx$/i, '')

  const clientesComEndereco = rotas.reduce(
    (s, r) => s + r.clientes.filter(c => c.endereco).length, 0)
  const totalClientes = rotas.reduce((s, r) => s + r.clientes.length, 0)

  return NextResponse.json({
    rotas,
    estatisticas,
    declaradas,
    xlsxBase64: xlsxBuffer.toString('base64'),
    pdfBase64: pdfBuffer.toString('base64'),
    romaneioXlsxBase64: romaneioXlsxBuffer.toString('base64'),
    romaneioPdfBase64: romaneioPdfBuffer.toString('base64'),
    temMatriz: !!matriz,
    totalClientesNaMatriz: matriz?.length ?? 0,
    clientesComEndereco,
    totalClientes,
    nomeBase,
  })
}

function formatarData(iso: string): string | undefined {
  if (!iso) return undefined
  const [a, m, d] = iso.split('-')
  if (!a || !m || !d) return undefined
  return `${d}/${m}/${a}`
}
