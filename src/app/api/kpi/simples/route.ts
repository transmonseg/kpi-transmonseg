import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseEscalaGeral } from '@/lib/parsers/escala-geral'
import { parseEscalaZonaSul } from '@/lib/parsers/escala-zona-sul'
import { parseEscalaPax } from '@/lib/parsers/escala-pax'
import { parseEscalaArmazemGrao } from '@/lib/parsers/escala-armazem-grao'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { cruzaEscalaUnitrac } from '@/lib/kpi/matcher'
import { gerarKpi, type LinhaParaKpi } from '@/lib/kpi/gerador-kpi'
import { gerarKpiPdf } from '@/lib/kpi/gerador-pdf'
import { REDE_NOMES_CANONICOS } from '@/lib/kpi/kpi-styles'
import type { KpiLinha, RotaKpi } from '@/lib/types/kpi'
import type { LinhaEscala } from '@/lib/types/escala'

export const runtime = 'nodejs'
export const maxDuration = 120

type AltConfirmada = {
  tipo: string
  entra: { motorista_nome: string | null; motorista_codigo: number | null; placa_raw: string | null; placa_norm: string | null } | null
  sai: { motorista_nome: string | null; placa_norm: string | null } | null
}

function rotaToLinha(rota: RotaKpi, escala: LinhaEscala, ordem: number): LinhaParaKpi {
  const p1 = rota.paradas[0] ?? null
  const p2 = rota.paradas[1] ?? null
  const p3 = rota.paradas[2] ?? null

  const motorista = escala.motorista_nome ?? null

  return {
    kpi_id: 'simples',
    escala_linha_id: rota.escala_linha_id,
    ordem,
    loja_nome: escala.loja_nome_raw,
    motorista,
    placa: rota.placa_norm,
    carro_ordem: escala.carro_ordem,
    saida_cd: rota.saida_cd,
    chd_loja_1: p1?.chegada ?? null,
    saida_loja_1: p1?.saida ?? null,
    tempo_loja_1_min: p1?.duracao_min ?? null,
    chd_loja_2: p2?.chegada ?? null,
    saida_loja_2: p2?.saida ?? null,
    tempo_loja_2_min: p2?.duracao_min ?? null,
    chd_loja_3: p3?.chegada ?? null,
    saida_loja_3: p3?.saida ?? null,
    tempo_loja_3_min: p3?.duracao_min ?? null,
    observacao: null,
    anomalias_codigos: [],
    motorista_codigo: escala.motorista_codigo,
  }
}

function aplicaAlteracoes(linhas: LinhaEscala[], alts: AltConfirmada[]): LinhaEscala[] {
  for (const alt of alts) {
    if (alt.tipo !== 'SUBSTITUICAO' && alt.tipo !== 'INCLUSAO') continue
    if (!alt.entra) continue
    const idx = linhas.findIndex(l => {
      if (alt.sai?.placa_norm && l.placa_norm === alt.sai.placa_norm) return true
      if (alt.sai?.motorista_nome) {
        const needle = alt.sai.motorista_nome.toLowerCase().split(' ')[0]
        if (needle.length >= 3 && l.motorista_nome?.toLowerCase().includes(needle)) return true
      }
      return false
    })
    if (idx >= 0) {
      const l = { ...linhas[idx] }
      if (alt.entra.placa_norm) l.placa_norm = alt.entra.placa_norm
      if (alt.entra.placa_raw) l.placa_raw = alt.entra.placa_raw
      if (alt.entra.motorista_nome) l.motorista_nome = alt.entra.motorista_nome
      if (alt.entra.motorista_codigo !== null && alt.entra.motorista_codigo !== undefined)
        l.motorista_codigo = String(alt.entra.motorista_codigo)
      linhas[idx] = l
    }
  }
  return linhas
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return new NextResponse('Body JSON inválido.', { status: 400 })

  const { escalaBucketPath, escalaBucketPaths, unitracBucketPath, data, alteracoes = [] } = body as {
    escalaBucketPath?: string
    escalaBucketPaths?: string[]
    unitracBucketPath: string
    data: string
    alteracoes?: AltConfirmada[]
  }

  // Normalize to array
  const escalaPaths: string[] = escalaBucketPaths ?? (escalaBucketPath ? [escalaBucketPath] : [])
  if (escalaPaths.length === 0) return new NextResponse('"escalaBucketPath" ou "escalaBucketPaths" obrigatório.', { status: 400 })
  if (!unitracBucketPath) return new NextResponse('"unitracBucketPath" obrigatório.', { status: 400 })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return new NextResponse('Data inválida. Use YYYY-MM-DD.', { status: 400 })

  const svc = createServiceClient()

  // Baixa e parseia cada escala, acumulando todas as linhas
  let escalaLinhas: LinhaEscala[] = []
  const MIN = 3

  for (const escalaBucketPath of escalaPaths) {
    const { data: escalaBlob, error: escalaErr } = await svc.storage.from('escalas-raw').download(escalaBucketPath)
    if (escalaErr || !escalaBlob) {
      return new NextResponse(`Erro ao baixar escala: ${escalaErr?.message ?? 'não encontrado'}`, { status: 500 })
    }
    const escalaBuffer = await escalaBlob.arrayBuffer()

    let linhasDoArquivo: LinhaEscala[] = []
    try {
      if (escalaBucketPath.endsWith('.pdf')) {
        const { parseEscalaGuanabaraPdf } = await import('@/lib/parsers/escala-guanabara-pdf')
        linhasDoArquivo = await parseEscalaGuanabaraPdf(Buffer.from(escalaBuffer), data)
      } else {
        const tentativas: Array<() => Promise<LinhaEscala[]>> = [
          () => parseEscalaZonaSul(escalaBuffer, data),
          () => parseEscalaArmazemGrao(escalaBuffer, data),
          () => parseEscalaPax(escalaBuffer, data),
          () => parseEscalaGeral(escalaBuffer, data),
        ]
        for (const fn of tentativas) {
          try {
            const r = await fn()
            if (r.length >= MIN) { linhasDoArquivo = r; break }
          } catch { /* próximo */ }
        }
      }
    } catch (e) {
      return new NextResponse(e instanceof Error ? e.message : 'Erro ao ler escala.', { status: 400 })
    }

    escalaLinhas.push(...linhasDoArquivo)
  }

  if (escalaLinhas.length === 0)
    return new NextResponse('Não foi possível detectar o tipo da escala. Verifique se os arquivos são escalas suportadas.', { status: 400 })

  // Baixa unitrac do Storage
  const { data: unitracBlob, error: unitracErr } = await svc.storage.from('unitrac-raw').download(unitracBucketPath)
  if (unitracErr || !unitracBlob)
    return new NextResponse(`Erro ao baixar unitrac: ${unitracErr?.message ?? 'não encontrado'}`, { status: 500 })
  const unitracBuffer = await unitracBlob.arrayBuffer()

  // Aplica alterações confirmadas in-memory
  if (alteracoes.length > 0) {
    escalaLinhas = aplicaAlteracoes([...escalaLinhas], alteracoes)
  }

  // Parse unitrac
  let veiculos
  try {
    if (unitracBucketPath.endsWith('.pdf')) {
      const { parseUnitracPdf } = await import('@/lib/parsers/unitrac-pdf')
      veiculos = await parseUnitracPdf(Buffer.from(unitracBuffer))
    } else {
      veiculos = await parseUnitrac(unitracBuffer)
    }
  } catch (e) {
    return new NextResponse(e instanceof Error ? e.message : 'Erro ao ler Unitrac.', { status: 400 })
  }
  if (veiculos.length === 0)
    return new NextResponse('Nenhum veículo encontrado no Unitrac.', { status: 400 })

  // Build matcher inputs
  const escalaMap = new Map<string, LinhaEscala>()
  const escalaRows = escalaLinhas.map((l, i) => {
    const id = `esc-${i}`
    escalaMap.set(id, l)
    return {
      id,
      rede_id: l.rede_id,
      placa_norm: l.placa_norm || null,
      loja_nome_raw: l.loja_nome_raw,
      loja_codigo_raw: l.loja_codigo_raw,
      motorista_nome: l.motorista_nome,
      carro_ordem: l.carro_ordem,
      data_entrega: l.data_entrega,
    }
  })

  const paradaRows = veiculos.flatMap((v, vi) =>
    v.paradas.map((p, pi) => ({
      id: `par-${vi}-${pi}`,
      placa_norm: p.placa_norm,
      chegada: p.chegada.toISOString(),
      saida: p.saida.toISOString(),
      duracao_seg: p.duracao_seg,
      local_parada: p.local_parada,
      codigo_loja: p.codigo_loja,
      nome_loja: p.nome_loja,
      lat: p.lat,
      lng: p.lng,
      classificacao: p.classificacao,
      ordem: p.ordem,
    }))
  )

  const rotas = cruzaEscalaUnitrac(escalaRows, paradaRows, [])

  const redeMap = new Map<string, { rotas: RotaKpi[]; escala: LinhaEscala[] }>()
  for (const rota of rotas) {
    const escala = escalaMap.get(rota.escala_linha_id)
    if (!escala) continue
    const rede_id = escala.rede_id
    if (!redeMap.has(rede_id)) redeMap.set(rede_id, { rotas: [], escala: [] })
    redeMap.get(rede_id)!.rotas.push(rota)
    redeMap.get(rede_id)!.escala.push(escala)
  }

  const results = await Promise.all(
    Array.from(redeMap.entries()).map(async ([rede_id, { rotas: redeRotas, escala: redeEscala }]) => {
      const sorted = redeRotas
        .map((r, i) => ({ rota: r, esc: redeEscala[i] }))
        .sort((a, b) => {
          const cmp = a.esc.loja_nome_raw.localeCompare(b.esc.loja_nome_raw)
          return cmp !== 0 ? cmp : a.esc.carro_ordem - b.esc.carro_ordem
        })

      const linhas: LinhaParaKpi[] = sorted.map(({ rota, esc }, idx) =>
        rotaToLinha(rota, esc, idx + 1)
      )

      const rede_nome = REDE_NOMES_CANONICOS[rede_id] ?? rede_id
      const qtd_sem_gps = linhas.filter(l => !l.saida_cd && !l.chd_loja_1).length

      const [xlsxBuffer, pdfBuffer] = await Promise.all([
        gerarKpi({ rede_id, data, linhas }),
        gerarKpiPdf({ rede_id, rede_nome, data, linhas: linhas as KpiLinha[] }),
      ])

      return {
        rede_id,
        rede_nome,
        qtd_rotas: linhas.length,
        qtd_sem_gps,
        xlsxBase64: xlsxBuffer.toString('base64'),
        pdfBase64: pdfBuffer.toString('base64'),
      }
    })
  )

  return NextResponse.json({ redes: results })
}
