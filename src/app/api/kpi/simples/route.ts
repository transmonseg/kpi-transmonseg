import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
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

function rotaToLinha(
  rota: RotaKpi,
  escala: LinhaEscala,
  ordem: number,
): LinhaParaKpi {
  const p1 = rota.paradas[0] ?? null
  const p2 = rota.paradas[1] ?? null
  const p3 = rota.paradas[2] ?? null

  let motorista = escala.motorista_nome ?? null
  if (escala.carro_ordem === 2 && motorista) motorista = `(2º CARRO) ${motorista}`

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

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const formData = await req.formData()
  const escalaFile = formData.get('escala')
  const unitracFile = formData.get('unitrac')
  const data = String(formData.get('data') ?? '')
  const altJson = formData.get('alteracoes')
  const alteracoes: Array<{
    tipo: string
    entra: { motorista_nome: string | null; motorista_codigo: number | null; placa_raw: string | null; placa_norm: string | null } | null
    sai: { motorista_nome: string | null; placa_norm: string | null } | null
  }> = altJson ? JSON.parse(String(altJson)) : []

  if (!(escalaFile instanceof File))
    return new NextResponse('Arquivo de escala não enviado.', { status: 400 })
  if (!(unitracFile instanceof File))
    return new NextResponse('Arquivo Unitrac não enviado.', { status: 400 })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data))
    return new NextResponse('Data inválida. Use YYYY-MM-DD.', { status: 400 })

  // Parse escala — AUTO detect (mesma ordem do upload route)
  const escalaBuffer = await escalaFile.arrayBuffer()
  const escalaName = escalaFile.name.toLowerCase()
  let escalaLinhas: LinhaEscala[] = []
  const MIN = 3

  try {
    if (escalaName.endsWith('.pdf')) {
      const { parseEscalaGuanabaraPdf } = await import('@/lib/parsers/escala-guanabara-pdf')
      escalaLinhas = await parseEscalaGuanabaraPdf(Buffer.from(escalaBuffer), data)
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
          if (r.length >= MIN) { escalaLinhas = r; break }
        } catch { /* próximo */ }
      }
    }
  } catch (e) {
    return new NextResponse(
      e instanceof Error ? e.message : 'Erro ao ler escala.',
      { status: 400 },
    )
  }
  if (escalaLinhas.length === 0)
    return new NextResponse(
      'Não foi possível detectar o tipo da escala. Verifique se o arquivo é uma escala suportada.',
      { status: 400 },
    )

  // Aplica alterações confirmadas in-memory (SUBSTITUICAO / INCLUSAO)
  if (alteracoes.length > 0) {
    for (const alt of alteracoes) {
      if (alt.tipo !== 'SUBSTITUICAO' && alt.tipo !== 'INCLUSAO') continue
      if (!alt.entra) continue
      const idx = escalaLinhas.findIndex(l => {
        if (alt.sai?.placa_norm && l.placa_norm === alt.sai.placa_norm) return true
        if (alt.sai?.motorista_nome) {
          const needle = alt.sai.motorista_nome.toLowerCase().split(' ')[0]
          if (needle.length >= 3 && l.motorista_nome?.toLowerCase().includes(needle)) return true
        }
        return false
      })
      if (idx >= 0) {
        const l = { ...escalaLinhas[idx] }
        if (alt.entra.placa_norm) l.placa_norm = alt.entra.placa_norm
        if (alt.entra.placa_raw) l.placa_raw = alt.entra.placa_raw
        if (alt.entra.motorista_nome) l.motorista_nome = alt.entra.motorista_nome
        if (alt.entra.motorista_codigo !== null && alt.entra.motorista_codigo !== undefined)
          l.motorista_codigo = String(alt.entra.motorista_codigo)
        escalaLinhas[idx] = l
      }
    }
  }

  // Parse unitrac
  let veiculos
  try {
    const unitracName = unitracFile.name.toLowerCase()
    if (unitracName.endsWith('.pdf')) {
      const { parseUnitracPdf } = await import('@/lib/parsers/unitrac-pdf')
      veiculos = await parseUnitracPdf(Buffer.from(await unitracFile.arrayBuffer()))
    } else {
      veiculos = await parseUnitrac(await unitracFile.arrayBuffer())
    }
  } catch (e) {
    return new NextResponse(
      e instanceof Error ? e.message : 'Erro ao ler Unitrac.',
      { status: 400 },
    )
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

  // Cross
  const rotas = cruzaEscalaUnitrac(escalaRows, paradaRows, [])

  // Group by rede
  const redeMap = new Map<string, { rotas: RotaKpi[]; escala: LinhaEscala[] }>()
  for (const rota of rotas) {
    const escala = escalaMap.get(rota.escala_linha_id)
    if (!escala) continue
    const rede_id = escala.rede_id
    if (!redeMap.has(rede_id)) redeMap.set(rede_id, { rotas: [], escala: [] })
    redeMap.get(rede_id)!.rotas.push(rota)
    redeMap.get(rede_id)!.escala.push(escala)
  }

  // Generate per rede
  const results = await Promise.all(
    Array.from(redeMap.entries()).map(async ([rede_id, { rotas: redeRotas, escala: redeEscala }]) => {
      // Sort by loja_nome + carro_ordem
      const sorted = redeRotas
        .map((r, i) => ({ rota: r, esc: redeEscala[i] }))
        .sort((a, b) => {
          const cmp = a.esc.loja_nome_raw.localeCompare(b.esc.loja_nome_raw)
          if (cmp !== 0) return cmp
          return a.esc.carro_ordem - b.esc.carro_ordem
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
