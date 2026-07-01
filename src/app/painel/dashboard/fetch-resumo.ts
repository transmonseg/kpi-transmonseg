import { createServiceClient } from '@/lib/supabase/service'
import { hojeBR } from '@/lib/data-br'
import type { ResumoOperacaoData, SerieDiaria } from './resumo-operacao'

function formatHoje(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
}

function formatRelativo(isoTs: string | null): string {
  if (!isoTs) return 'sem registro'
  const dt = new Date(isoTs)
  if (Number.isNaN(dt.getTime())) return 'sem registro'
  const min = Math.floor((Date.now() - dt.getTime()) / 60_000)
  if (min < 1) return 'agora há pouco'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.floor(h / 24)
  if (d < 7) return `há ${d} dia${d === 1 ? '' : 's'}`
  return dt.toLocaleDateString('pt-BR')
}

// 14 datas ISO terminando hoje (fuso de Brasília)
function ultimos14dias(): string[] {
  const base = new Date(`${hojeBR()}T12:00:00Z`)
  const out: string[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date(base)
    d.setUTCDate(base.getUTCDate() - i)
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

export async function fetchResumo(): Promise<ResumoOperacaoData> {
  const hoje = hojeBR()
  const dias = ultimos14dias()
  const svc = createServiceClient()

  const [geracoesHojeRes, ultimaRes, serie14dRes] = await Promise.all([
    svc.from('kpi_simples').select('id', { count: 'exact', head: true }).eq('data', hoje),
    svc.from('kpi_simples').select('id, data, gerado_em, total_rotas, redes').order('gerado_em', { ascending: false }).limit(1).maybeSingle(),
    svc.from('kpi_simples').select('data, total_rotas, total_sem_gps, gerado_em').gte('data', dias[0]).order('gerado_em', { ascending: false }),
  ])

  // só a geração mais recente de cada dia (sort já é DESC)
  const porDia = new Map<string, { rotas: number; semGps: number }>()
  for (const row of (serie14dRes.data ?? []) as Array<{ data: string; total_rotas: number | null; total_sem_gps: number | null }>) {
    if (!porDia.has(row.data)) porDia.set(row.data, { rotas: row.total_rotas ?? 0, semGps: row.total_sem_gps ?? 0 })
  }
  const serie14d: SerieDiaria[] = dias.map(iso => {
    const v = porDia.get(iso)
    const rotas = v?.rotas ?? 0
    const semGps = v?.semGps ?? 0
    return { data: iso, rotas, semGps, cobertura: rotas > 0 ? Math.round(((rotas - semGps) / rotas) * 100) : 0 }
  })

  const u = ultimaRes.data
  return {
    hojeFormatado: formatHoje(hoje),
    geracoesHoje: geracoesHojeRes.count ?? 0,
    ultimaGeracao: u
      ? {
          totalRotas: (u.total_rotas as number | null) ?? 0,
          redes: ((u.redes as unknown[] | null) ?? []).length,
          relativo: formatRelativo(u.gerado_em as string | null),
        }
      : null,
    serie14d,
  }
}
