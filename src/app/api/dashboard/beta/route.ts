import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { calcularMetricas, filtrar } from '@/lib/kpi/dashboard-metricas'
import { intervaloPeriodo, intervaloAnterior } from '@/lib/kpi/dashboard-query'
import { hojeBR } from '@/lib/data-br'
import { parseEscalaArquivo } from '@/lib/parsers/escala-arquivo'
import { gerarDiaApi, salvarDiaApi, carregarEntradasApi, carregarResumosApi, type EscalaParaDia } from '@/lib/kpi/dashboard-api-fonte'
import type { LojaRow, GeoStore } from '@/lib/kpi/matcher'

export const runtime = 'nodejs'
export const maxDuration = 120

async function carregarLojasEGeo(svc: ReturnType<typeof createServiceClient>): Promise<{ lojas: LojaRow[]; geoStores: GeoStore[] }> {
  const [lojasRes, canonRes] = await Promise.all([
    svc.from('lojas').select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros, endereco, bairro, municipio, numero').eq('ativo', true).order('id'),
    svc.from('canonical_loja').select('id, name, lat, lng, raio_metros').not('lat', 'is', null).not('lng', 'is', null),
  ])
  const lojas = (lojasRes.data ?? []).map((l) => ({ ...l, raio_metros: (l.raio_metros as number | null) ?? 150 })) as unknown as LojaRow[]
  const geoStores = (canonRes.data ?? []).map((c) => ({ id: c.id as string, name: c.name as string, lat: c.lat as number, lng: c.lng as number, raio_metros: (c.raio_metros as number | null) ?? 150 })) as GeoStore[]
  return { lojas, geoStores }
}

/** Escala do dia: 1º das escala_linhas persistidas (via escala_uploads do dia);
 *  senão dos arquivos enviados. Duas queries (sem join — mais robusto que !inner). */
async function escalaDoDia(svc: ReturnType<typeof createServiceClient>, data: string, escalaPaths: string[]): Promise<EscalaParaDia[]> {
  const { data: ups } = await svc.from('escala_uploads').select('id').eq('data_escala', data)
  const ids = (ups ?? []).map((u) => u.id as string)
  if (ids.length > 0) {
    const { data: rows } = await svc.from('escala_linhas')
      .select('rede_id, loja_nome_raw, loja_codigo_raw, placa_norm, motorista_nome, carro_ordem, data_entrega')
      .in('escala_upload_id', ids)
    if (rows && rows.length > 0) {
      return rows.map((r) => ({
        rede_id: r.rede_id as string, placa_norm: (r.placa_norm as string | null) ?? null,
        loja_nome_raw: r.loja_nome_raw as string, loja_codigo_raw: (r.loja_codigo_raw as string | null) ?? null,
        motorista_nome: (r.motorista_nome as string | null) ?? null, carro_ordem: (r.carro_ordem as 1 | 2) ?? 1,
        data_entrega: (r.data_entrega as string | null) ?? data,
      }))
    }
  }
  const out: EscalaParaDia[] = []
  for (const p of escalaPaths) {
    const { data: blob } = await svc.storage.from('escalas-raw').download(p)
    if (!blob) continue
    const linhas = await parseEscalaArquivo(await blob.arrayBuffer(), p, data)
    for (const l of linhas) out.push({ rede_id: l.rede_id, placa_norm: l.placa_norm || null, loja_nome_raw: l.loja_nome_raw, loja_codigo_raw: l.loja_codigo_raw, motorista_nome: l.motorista_nome, carro_ordem: l.carro_ordem, data_entrega: l.data_entrega ?? data })
  }
  return out
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })
  const body = await req.json().catch(() => null)
  const data: string = body?.data
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return new NextResponse('Data inválida (YYYY-MM-DD).', { status: 400 })
  const escalaPaths: string[] = Array.isArray(body?.escalaPaths) ? body.escalaPaths : []

  const svc = createServiceClient()
  const escala = await escalaDoDia(svc, data, escalaPaths)
  if (escala.length === 0) return new NextResponse('Sem escala pra esse dia. Gere o KPI do dia ou envie a escala.', { status: 400 })

  const { lojas, geoStores } = await carregarLojasEGeo(svc)
  const entradas = await gerarDiaApi(svc, data, escala, lojas, geoStores)
  await salvarDiaApi(svc, data, entradas)
  const entregues = entradas.filter(e => e.status === 'entregue').length
  return NextResponse.json({ data, total: entradas.length, entregues })
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })
  const u = new URL(req.url)
  const periodo = u.searchParams.get('periodo') ?? 'dia'
  const ref = u.searchParams.get('data') ?? hojeBR()
  const [ini, fim] = periodo === 'custom'
    ? [u.searchParams.get('de') ?? ref, u.searchParams.get('ate') ?? ref]
    : intervaloPeriodo(periodo, ref)
  const redes = (u.searchParams.get('redes') ?? '').split(',').filter(Boolean)
  const completo = u.searchParams.get('completo') === '1'

  const svc = createServiceClient()
  const linhas = await carregarEntradasApi(svc, ini, fim)
  const filt = filtrar(linhas, { redes })
  // Andamento ao vivo (campo extra gravado no JSON do dia; calcularMetricas o ignora).
  const andamento = { ENTREGUE: 0, EM_ROTA: 0, NA_BASE: 0, SEM_SINAL: 0 }
  for (const l of filt as Array<{ situacaoViva?: keyof typeof andamento }>) {
    if (l.situacaoViva && l.situacaoViva in andamento) andamento[l.situacaoViva]++
  }
  let metricasAnterior = null
  if (periodo !== 'custom') {
    try {
      const [aIni, aFim] = intervaloAnterior(periodo, ref)
      const ant = filtrar(await carregarEntradasApi(svc, aIni, aFim), { redes })
      if (ant.length) metricasAnterior = calcularMetricas(ant)
    } catch { metricasAnterior = null }
  }
  const resumoApi = await carregarResumosApi(svc, ini, fim)
  return NextResponse.json({ periodo, ref, intervalo: [ini, fim], redes, metricas: calcularMetricas(filt, completo), metricasAnterior, andamento, resumoApi })
}
