import '@/lib/polyfills/pdf-parse-polyfill'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { carregarCadastroPlacasPdf } from '@/lib/unitrac/cadastro-placas'
// parseUnitracPdf carrega pdf-parse (depende de DOMMatrix); import dinâmico
// dentro do handler pra não falhar no "collect page data" do build.

export const runtime = 'nodejs'
export const maxDuration = 120

type Formato = 'xlsx' | 'pdf'

function detectaFormato(path: string): Formato | null {
  const lower = path.toLowerCase()
  if (lower.endsWith('.pdf')) return 'pdf'
  if (lower.endsWith('.xlsx')) return 'xlsx'
  return null
}

// PostgreSQL/JSON rejeitam null bytes (U+0000) e outros control chars em texto.
// pdf-parse v1 às vezes deixa esses bytes na extração — sanitizar antes do insert.
// Mantém TAB (U+0009), LF (U+000A) e CR (U+000D); remove o resto do range 0x00-0x1F.
const CONTROL_CHARS_RE = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]', 'g')
function sanitizeText(s: string | null | undefined): string | null {
  if (s == null) return null
  return s.replace(CONTROL_CHARS_RE, '')
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const { data, storagePath } = await req.json()

  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data as string))
    return new NextResponse('Data inválida. Use YYYY-MM-DD.', { status: 400 })

  if (!storagePath || typeof storagePath !== 'string')
    return new NextResponse('storagePath ausente.', { status: 400 })

  const formato = detectaFormato(storagePath)
  if (!formato)
    return new NextResponse(
      'Extensão do arquivo não suportada. Use .xlsx ou .pdf.',
      { status: 400 }
    )

  const svc = createServiceClient()

  // Cenário A: sempre sobrescreve, sem perguntar
  const { data: existente } = await svc
    .from('unitrac_uploads')
    .select('id')
    .eq('data_relatorio', data)
    .maybeSingle()

  // Read file from Storage
  const { data: fileBlob, error: downloadErr } = await svc.storage
    .from('unitrac-raw')
    .download(storagePath)

  if (downloadErr || !fileBlob)
    return new NextResponse(
      `Erro ao ler arquivo do storage: ${downloadErr?.message ?? 'arquivo não encontrado'}`,
      { status: 500 }
    )

  const arrayBuffer = await fileBlob.arrayBuffer()
  let veiculos

  // Cadastro de placas conhecidas: usado pelo parser PDF para corrigir confusão
  // OCR na pos-4 (LCO-0978 vs LCO-0J78). Fonte: `unitrac_paradas` (alimentada
  // por XLSX, que não sofre OCR). Só carregamos pra formato pdf; xlsx é texto
  // estruturado e o nome de aba já vem limpo.
  let cadastroPlacas: Set<string> | null = null
  if (formato === 'pdf') {
    cadastroPlacas = await carregarCadastroPlacasPdf(svc)
  }

  try {
    if (formato === 'pdf') {
      const { parseUnitracPdf } = await import('@/lib/parsers/unitrac-pdf')
      veiculos = await parseUnitracPdf(Buffer.from(arrayBuffer), cadastroPlacas)
    } else {
      veiculos = await parseUnitrac(arrayBuffer)
    }
  } catch (e) {
    return new NextResponse(
      e instanceof Error ? e.message : 'Erro ao parsear relatório Unitrac.',
      { status: 400 }
    )
  }

  if (veiculos.length === 0)
    return new NextResponse('Nenhum veículo encontrado no arquivo.', { status: 400 })

  const qtdParadas = veiculos.reduce((acc, v) => acc + v.paradas.length, 0)

  const uploadPayload = {
    data_relatorio: data,
    arquivo_path: storagePath,
    qtd_abas: veiculos.length,
    qtd_paradas: qtdParadas,
    status: 'processado',
    uploaded_by: user.id,
  }

  let uploadId: string

  if (existente) {
    // Limpa paradas antigas e reutiliza o mesmo registro de upload (evita violar UNIQUE)
    const { error: delParadasErr } = await svc
      .from('unitrac_paradas')
      .delete()
      .eq('unitrac_upload_id', existente.id)
    if (delParadasErr)
      return new NextResponse(`Erro ao limpar paradas antigas: ${delParadasErr.message}`, { status: 500 })

    const { error: updErr } = await svc
      .from('unitrac_uploads')
      .update(uploadPayload)
      .eq('id', existente.id)
    if (updErr)
      return new NextResponse(`Erro ao atualizar upload: ${updErr.message}`, { status: 500 })

    uploadId = existente.id
  } else {
    const { data: upload, error: uploadErr } = await svc
      .from('unitrac_uploads')
      .insert(uploadPayload)
      .select('id')
      .single()
    if (uploadErr || !upload)
      return new NextResponse(`Erro ao registrar upload: ${uploadErr?.message}`, { status: 500 })
    uploadId = upload.id
  }

  const BATCH = 200
  const todasParadas = veiculos.flatMap((v) =>
    v.paradas.map((p) => ({
      unitrac_upload_id: uploadId,
      placa_norm: p.placa_norm,
      chegada: p.chegada.toISOString(),
      saida: p.saida.toISOString(),
      duracao_seg: p.duracao_seg,
      distancia_km: p.distancia_km,
      endereco: sanitizeText(p.endereco),
      lat: p.lat,
      lng: p.lng,
      local_parada: sanitizeText(p.local_parada),
      codigo_loja: sanitizeText(p.codigo_loja),
      nome_loja: sanitizeText(p.nome_loja),
      classificacao: p.classificacao,
      loja_id: null,
      ordem: p.ordem,
    }))
  )

  for (let i = 0; i < todasParadas.length; i += BATCH) {
    const { error: insertErr } = await svc
      .from('unitrac_paradas')
      .insert(todasParadas.slice(i, i + BATCH))

    if (insertErr)
      return new NextResponse(`Erro ao inserir paradas: ${insertErr.message}`, { status: 500 })
  }

  // Auto-cadastro de lojas novas em canonical_loja
  // Agrega paradas LOJA por nome+código, calcula lat/lng médio das observações
  type AggLoja = { name: string; codigo: string | null; lats: number[]; lngs: number[] }
  const agregadas = new Map<string, AggLoja>()
  for (const p of todasParadas) {
    if (p.classificacao !== 'LOJA') continue
    if (!p.nome_loja || p.lat == null || p.lng == null) continue
    const key = (p.codigo_loja ?? p.nome_loja).trim()
    const cur = agregadas.get(key) ?? { name: p.nome_loja.trim(), codigo: p.codigo_loja, lats: [], lngs: [] }
    cur.lats.push(p.lat)
    cur.lngs.push(p.lng)
    agregadas.set(key, cur)
  }

  let autoCadastradas = 0
  if (agregadas.size > 0) {
    const nomesNorm = [...agregadas.values()].map((a) => normalizaNomeCanonico(a.name))
    const codigos = [...agregadas.values()].map((a) => a.codigo).filter((c): c is string => !!c)

    const [{ data: canonExist }, { data: lojasExist }, { data: escalaDoDia }] = await Promise.all([
      svc.from('canonical_loja').select('nome_norm').in('nome_norm', nomesNorm),
      codigos.length > 0
        ? svc.from('lojas').select('codigo_unitrac').in('codigo_unitrac', codigos)
        : Promise.resolve({ data: [] as { codigo_unitrac: string | null }[] }),
      svc.from('escala_linhas').select('loja_codigo_raw, loja_nome_raw').eq('data_entrega', data),
    ])
    const jaCanon = new Set((canonExist ?? []).map((r) => r.nome_norm as string))
    const jaLoja = new Set((lojasExist ?? []).map((r) => r.codigo_unitrac as string).filter(Boolean))

    // Regra de produto (validar loja na escala): o Unitrac traz MUITOS clientes que
    // a Triforce não atende. Só auto-cadastra o que aparece na ESCALA real do dia —
    // cruzando por código (exato/sufixo) ou nome normalizado. Sem escala carregada
    // pro dia, nada entra (conservador) — evita poluir canonical_loja com não-clientes.
    const codigosEscala = new Set<string>()
    const nomesEscala = new Set<string>()
    for (const e of escalaDoDia ?? []) {
      const c = e.loja_codigo_raw as string | null
      const n = e.loja_nome_raw as string | null
      if (c) codigosEscala.add(String(c).trim())
      if (n) nomesEscala.add(normalizaNomeCanonico(n))
    }
    const naEscala = (a: AggLoja): boolean => {
      if (nomesEscala.has(normalizaNomeCanonico(a.name))) return true
      if (!a.codigo) return false
      const cod = a.codigo.trim()
      if (codigosEscala.has(cod)) return true
      for (const e of codigosEscala) {
        if (cod.length >= 3 && e.endsWith(cod)) return true
        if (e.length >= 3 && cod.endsWith(e)) return true
      }
      return false
    }

    const novas = [...agregadas.values()]
      .filter((a) => {
        if (jaCanon.has(normalizaNomeCanonico(a.name))) return false
        if (a.codigo && jaLoja.has(a.codigo)) return false
        if (!naEscala(a)) return false
        return true
      })
      .map((a) => ({
        name: a.name,
        nome_norm: normalizaNomeCanonico(a.name),
        lat: media(a.lats),
        lng: media(a.lngs),
        raio_metros: 300,
        rede_id: inferirRede(a.name),
      }))

    if (novas.length > 0) {
      const { error: canonErr } = await svc.from('canonical_loja').insert(novas)
      if (!canonErr) autoCadastradas = novas.length
      else console.error('[canonical_loja] auto-cadastro falhou:', canonErr.message)
    }
  }

  return NextResponse.json({
    upload_id: uploadId,
    qtd_abas: veiculos.length,
    qtd_paradas: qtdParadas,
    substituiu: !!existente,
    lojas_auto_cadastradas: autoCadastradas,
  })
}

// Normalização compatível com nome_norm de canonical_loja (lowercase + sem acentos, mantém espaços/hífens)
function normalizaNomeCanonico(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')
}

function media(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

// Heurística simples: detecta prefixo do nome para inferir rede_id
function inferirRede(nome: string): string | null {
  const upper = nome.toUpperCase()
  if (upper.startsWith('SENDAS')) return 'SENDAS'
  if (upper.startsWith('ASSAI') || upper.startsWith('ASSAÍ')) return 'ASSAI'
  if (upper.startsWith('PRINCESA')) return 'PRINCESA'
  if (upper.startsWith('CARREFOUR')) return 'CARREFOUR'
  if (upper.startsWith('PREZUNIC')) return 'PREZUNIC'
  if (upper.startsWith('ATACADAO') || upper.startsWith('ATACADÃO')) return 'ATACADAO'
  if (upper.startsWith('ZONA SUL')) return 'ZONA_SUL'
  if (upper.startsWith('SUPER PRIX') || upper.startsWith('SUPERPRIX')) return 'SUPERPRIX'
  if (upper.startsWith('SAM') && upper.includes('CLUB')) return 'SAMS_CLUB'
  if (upper.startsWith('VIANENSE')) return 'VIANENSE'
  if (upper.startsWith('GUANABARA')) return 'GUANABARA'
  if (upper.startsWith('MUNDIAL')) return 'MUNDIAL'
  if (upper.includes('EMANUEL')) return 'EMANUEL'
  if (upper.startsWith('FEIRA NOVA')) return 'FEIRA_NOVA'
  if (upper.includes('SUPER PAX') || upper.includes('PAX ')) return 'SUPER_PAX'
  if (upper.includes('ARMAZEM') && upper.includes('GRAO')) return 'ARMAZEM_GRAO'
  return null
}
