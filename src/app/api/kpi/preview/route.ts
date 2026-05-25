/**
 * /api/kpi/preview — Tela de revisão antes de gerar KPI.
 *
 * Recebe os mesmos parâmetros do /api/kpi/simples (escalaBucketPaths, unitracBucketPaths,
 * data) e retorna estrutura de revisão agrupada por rede:
 *
 * {
 *   data: "2026-05-22",
 *   redes: {
 *     ZONA_SUL: {
 *       total: 53,
 *       ok_full: [{ placa, motorista, lojas: ["..."] }],
 *       ok_parcial: [{ placa, motorista, lojas_casadas: [...], lojas_sem_match: [...] }],
 *       sem_rastreador: [{ placa, motorista, lojas: [...] }],
 *     },
 *     ...
 *   },
 *   fora_escala: [{ placa, paradas_observadas: [...] }]
 * }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseEscalaGeral } from '@/lib/parsers/escala-geral'
import { parseEscalaZonaSul } from '@/lib/parsers/escala-zona-sul'
import { parseEscalaPax } from '@/lib/parsers/escala-pax'
import { parseEscalaArmazemGrao } from '@/lib/parsers/escala-armazem-grao'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { cruzaEscalaUnitrac } from '@/lib/kpi/matcher'
import { isVeiculoInativo } from '@/lib/kpi/veiculos-inativos'
import type { LinhaEscala } from '@/lib/types/escala'

export const runtime = 'nodejs'
export const maxDuration = 60

interface PreviewPlaca {
  placa: string
  motorista: string | null
  lojas_escala: Array<{ nome: string; codigo: string | null; ordem: number }>
  paradas_unitrac?: Array<{ codigo: string | null; nome: string | null; chegada: string }>
}

interface PreviewRedeBucket {
  total: number
  ok_full: PreviewPlaca[]
  ok_parcial: Array<PreviewPlaca & { lojas_casadas: string[]; lojas_sem_match: string[] }>
  sem_rastreador: PreviewPlaca[]
}

interface PreviewResposta {
  data: string
  total_placas_escala: number
  total_placas_unitrac: number
  redes: Record<string, PreviewRedeBucket>
  fora_escala: Array<{ placa: string; paradas: Array<{ codigo: string | null; nome: string | null; chegada: string }> }>
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return new NextResponse('Body JSON inválido.', { status: 400 })

  const { escalaBucketPaths, unitracBucketPaths, data } = body as {
    escalaBucketPaths?: string[]
    unitracBucketPaths?: string[]
    data: string
  }

  if (!escalaBucketPaths || escalaBucketPaths.length === 0) {
    return new NextResponse('"escalaBucketPaths" obrigatório.', { status: 400 })
  }
  if (!unitracBucketPaths || unitracBucketPaths.length === 0) {
    return new NextResponse('"unitracBucketPaths" obrigatório.', { status: 400 })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return new NextResponse('Data inválida.', { status: 400 })

  const svc = createServiceClient()

  // Parse escalas
  const escalaLinhas: LinhaEscala[] = []
  const MIN = 3
  for (const escalaPath of escalaBucketPaths) {
    const { data: blob } = await svc.storage.from('escalas-raw').download(escalaPath)
    if (!blob) continue
    const buf = await blob.arrayBuffer()
    let linhasDoArquivo: LinhaEscala[] = []
    try {
      if (escalaPath.endsWith('.pdf')) {
        const { parseEscalaGuanabaraPdf } = await import('@/lib/parsers/escala-guanabara-pdf')
        linhasDoArquivo = await parseEscalaGuanabaraPdf(Buffer.from(buf), data)
      } else {
        const tentativas = [
          () => parseEscalaZonaSul(buf, data),
          () => parseEscalaArmazemGrao(buf, data),
          () => parseEscalaPax(buf, data),
          () => parseEscalaGeral(buf, data),
        ]
        for (const fn of tentativas) {
          try {
            const r = await fn()
            if (r.length >= MIN) { linhasDoArquivo = r; break }
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
    escalaLinhas.push(...linhasDoArquivo)
  }

  // Parse Unitrac
  const veiculosMap = new Map<string, import('@/lib/types/unitrac').ResumoVeiculo>()
  for (const unitracPath of unitracBucketPaths) {
    const { data: blob } = await svc.storage.from('unitrac-raw').download(unitracPath)
    if (!blob) continue
    const buf = await blob.arrayBuffer()
    try {
      let parsed
      if (unitracPath.endsWith('.pdf')) {
        const { parseUnitracPdf } = await import('@/lib/parsers/unitrac-pdf')
        parsed = await parseUnitracPdf(Buffer.from(buf), new Set())
      } else {
        parsed = await parseUnitrac(buf)
      }
      for (const v of parsed) {
        if (!veiculosMap.has(v.placa_norm)) veiculosMap.set(v.placa_norm, v)
        else {
          const ex = veiculosMap.get(v.placa_norm)!
          veiculosMap.set(v.placa_norm, { ...ex, paradas: [...ex.paradas, ...v.paradas] })
        }
      }
    } catch { /* ignore */ }
  }
  const veiculos = Array.from(veiculosMap.values())

  // Build matcher inputs
  const escalaRows = escalaLinhas.map((l, i) => ({
    id: `esc-${i}`,
    rede_id: l.rede_id,
    placa_norm: l.placa_norm || null,
    loja_nome_raw: l.loja_nome_raw,
    loja_codigo_raw: l.loja_codigo_raw,
    motorista_nome: l.motorista_nome,
    carro_ordem: l.carro_ordem,
    data_entrega: l.data_entrega,
  }))
  const paradaRows = veiculos.flatMap((v, vi) => v.paradas.map((p, pi) => ({
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
  })))

  // Load lojas
  const { data: lojasData } = await svc
    .from('lojas')
    .select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros')
    .eq('ativo', true)
  const lojas = (lojasData ?? []).map(l => ({
    id: l.id as string,
    rede_id: l.rede_id as string,
    nome: (l.nome as string) ?? '',
    nome_normalizado: (l.nome_normalizado as string) ?? '',
    codigo_escala: l.codigo_escala as string | null,
    codigo_unitrac: l.codigo_unitrac as string | null,
    nome_unitrac: l.nome_unitrac as string | null,
    lat: l.lat as number | null,
    lng: l.lng as number | null,
    raio_metros: (l.raio_metros as number | null) ?? 150,
  }))

  const rotas = await cruzaEscalaUnitrac(escalaRows, paradaRows, lojas)

  // Agrupa rotas por placa+rede
  const grupos = new Map<string, { rede: string; placa: string; motorista: string | null; linhas: typeof escalaRows; matches: number; total: number; lojas_casadas: string[]; lojas_sem_match: string[] }>()
  for (const l of escalaRows) {
    if (!l.placa_norm) continue
    const key = `${l.placa_norm}|${l.rede_id}`
    const g = grupos.get(key) ?? {
      rede: l.rede_id, placa: l.placa_norm, motorista: l.motorista_nome,
      linhas: [] as typeof escalaRows, matches: 0, total: 0, lojas_casadas: [] as string[], lojas_sem_match: [] as string[],
    }
    g.linhas.push(l)
    g.total++
    const rota = rotas.find(r => r.escala_linha_id === l.id)
    if (rota && rota.paradas.length > 0) { g.matches++; g.lojas_casadas.push(l.loja_nome_raw) }
    else g.lojas_sem_match.push(l.loja_nome_raw)
    grupos.set(key, g)
  }

  // Monta resposta
  const resp: PreviewResposta = {
    data,
    total_placas_escala: new Set(escalaRows.map(e => e.placa_norm).filter(Boolean)).size,
    total_placas_unitrac: veiculos.length,
    redes: {},
    fora_escala: [],
  }

  for (const g of grupos.values()) {
    const placasUnitrac = veiculosMap.get(g.placa.replace(/-/g, ''))?.paradas ?? []
    const paradasLoja = placasUnitrac.filter(p => p.classificacao === 'LOJA')
    const semRastreador = paradasLoja.length === 0
    const placa: PreviewPlaca = {
      placa: g.placa,
      motorista: g.motorista,
      lojas_escala: g.linhas.map(l => ({ nome: l.loja_nome_raw, codigo: l.loja_codigo_raw, ordem: l.carro_ordem })),
    }
    if (!resp.redes[g.rede]) resp.redes[g.rede] = { total: 0, ok_full: [], ok_parcial: [], sem_rastreador: [] }
    resp.redes[g.rede].total += g.total

    if (semRastreador || isVeiculoInativo(g.placa)) {
      resp.redes[g.rede].sem_rastreador.push(placa)
    } else if (g.matches === g.total) {
      resp.redes[g.rede].ok_full.push(placa)
    } else {
      resp.redes[g.rede].ok_parcial.push({ ...placa, lojas_casadas: g.lojas_casadas, lojas_sem_match: g.lojas_sem_match })
    }
  }

  // Fora escala: placas no Unitrac que não estão na escala
  const placasEscala = new Set(escalaRows.map(e => e.placa_norm).filter(Boolean))
  for (const v of veiculos) {
    if (placasEscala.has(v.placa_norm)) continue
    const paradasLoja = v.paradas.filter(p => p.classificacao === 'LOJA')
    if (paradasLoja.length === 0) continue
    resp.fora_escala.push({
      placa: v.placa_norm,
      paradas: paradasLoja.slice(0, 5).map(p => ({
        codigo: p.codigo_loja,
        nome: p.nome_loja,
        chegada: p.chegada.toISOString(),
      })),
    })
  }

  return NextResponse.json(resp)
}
