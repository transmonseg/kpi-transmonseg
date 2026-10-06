import { NextRequest, NextResponse } from 'next/server'
import { hojeBR } from '@/lib/data-br'
import { createServiceClient } from '@/lib/supabase/service'
import { buscarFrota, normPlaca } from '@/lib/unitrac-api'
import { buscarPosicoesPorCv } from '@/lib/unitrac-api/posicoes'
import { buscarParadasDoDia } from '@/lib/kpi-romaneio/unitrac'
import { COD_USER_NUTRIMAX } from '@/lib/kpi-romaneio/constants'
import { paradaEmAndamento, nfProxima } from '@/lib/kpi-romaneio/ao-vivo'
import type { ResultadoAoVivo } from '@/lib/kpi-romaneio/ao-vivo-servico'
import { buscarFrotaRioQuality } from '@/lib/kpi-rioquality/frota'
import type { ClienteAoVivo } from '@/lib/kpi-romaneio/ao-vivo-servico'
import { acessoAoVivo } from '../acesso'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Camada "agora" da tela ao vivo: onde o caminhão está e se está parado num
// cliente desde quando. SÓ MOSTRA — status/entregue é sempre do cálculo do KPI.
// 1 consulta à Unitrac por placa a cada 30 s no máximo (cache), não importa
// quantas pessoas estejam olhando.
type Agora = {
  posicao: { lat: number | null; lng: number | null; datagps: string | null } | null
  parada: { inicio: string } | null
  nf: { nf: string; cliente: string } | null
  consultadoEm: string
}
const cache = new Map<string, { em: number; valor: Agora }>()
const frotaCache = new Map<ClienteAoVivo, { em: number; cvPorPlaca: Map<string, string> }>()

async function cvDaPlaca(cliente: ClienteAoVivo, placa: string): Promise<string | null> {
  const c = frotaCache.get(cliente)
  if (!c || Date.now() - c.em > 10 * 60_000) {
    const cvPorPlaca = cliente === 'rioquality'
      ? await buscarFrotaRioQuality()
      : new Map((await buscarFrota(COD_USER_NUTRIMAX)).map(v => [v.placaNorm, v.cv] as [string, string]))
    frotaCache.set(cliente, { em: Date.now(), cvPorPlaca })
  }
  return frotaCache.get(cliente)!.cvPorPlaca.get(placa) ?? null
}

export async function GET(req: NextRequest) {
  const a = await acessoAoVivo(req.nextUrl.searchParams.get('cliente'))
  if (!a.ok) return a.resp
  const placa = normPlaca(req.nextUrl.searchParams.get('placa') ?? '')
  if (!placa) return new NextResponse('Placa obrigatória.', { status: 400 })
  const chave = `${a.cliente}:${placa}`
  const emCache = cache.get(chave)
  if (emCache && Date.now() - emCache.em < 30_000) return NextResponse.json(emCache.valor)

  const data = hojeBR()
  const cv = await cvDaPlaca(a.cliente, placa)
  const valor: Agora = { posicao: null, parada: null, nf: null, consultadoEm: new Date().toISOString() }
  if (cv) {
    const [posicoes, paradas, calculo] = await Promise.all([
      buscarPosicoesPorCv([cv]).catch(() => new Map()),
      buscarParadasDoDia(cv, placa, data, 18).catch(() => []),
      createServiceClient().from('kpi_ao_vivo_calculo').select('resultado').eq('cliente', a.cliente).eq('data', data).maybeSingle(),
    ])
    const pos = posicoes.get(cv)
    if (pos) valor.posicao = { lat: pos.lat, lng: pos.lng, datagps: pos.datagps }
    const parada = paradaEmAndamento(paradas, Date.now())
    if (parada) {
      valor.parada = { inicio: parada.inicio }
      const ponto = parada.lat != null && parada.lng != null ? { lat: parada.lat, lng: parada.lng } : pos?.lat != null && pos?.lng != null ? { lat: pos.lat, lng: pos.lng } : null
      const nfsPlaca = (calculo.data?.resultado as ResultadoAoVivo | null)?.placas.find(p => p.placa === placa)?.nfs ?? []
      const n = ponto ? nfProxima(nfsPlaca, ponto) : null
      if (n) valor.nf = { nf: n.nf, cliente: n.cliente }
    }
  }
  cache.set(chave, { em: Date.now(), valor })
  return NextResponse.json(valor)
}
