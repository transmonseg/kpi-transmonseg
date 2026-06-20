import type { SupabaseClient } from '@supabase/supabase-js'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import { montarResumoDeParadaRows, salvarResumoSeMelhor } from '@/lib/kpi/dashboard-api-fonte'
import { haversine } from '@/lib/utils/geo'

/**
 * A partir de um DIA já inserido (KPI manual), pega o relatório PDF do Unitrac
 * daquele dia que JÁ está no banco (salvo numa geração de KPI, kpi_simples →
 * bucket unitrac-raw), extrai as paradas indevidas e fixa o resumo do dia — assim
 * o mapa/paradas aparecem mesmo nos dias que entram só pela planilha manual.
 * Best-effort: qualquer falha retorna { ok: false } sem lançar (não trava o upload).
 */
export async function puxarResumoDoPdfDoDia(svc: SupabaseClient, data: string): Promise<{ ok: boolean; motivo?: string; paradas?: number }> {
  try {
    // 1) acha o PDF do dia (última geração com unitrac_path)
    const { data: rows } = await svc.from('kpi_simples')
      .select('unitrac_path').eq('data', data).not('unitrac_path', 'is', null)
      .order('gerado_em', { ascending: false }).limit(1)
    const path = (rows?.[0] as { unitrac_path?: string } | undefined)?.unitrac_path
    if (!path) return { ok: false, motivo: 'sem-pdf' }

    // 2) baixa o PDF do storage
    const { data: blob, error } = await svc.storage.from('unitrac-raw').download(path)
    if (error || !blob) return { ok: false, motivo: 'download-falhou' }

    // 3) extrai as paradas do PDF
    const { parseUnitracPdf } = await import('@/lib/parsers/unitrac-pdf')
    const veiculos = await parseUnitracPdf(await blob.arrayBuffer(), null)

    // 4) ResumoVeiculo[] → UnitracParadaRow[]
    const paradaRows: UnitracParadaRow[] = veiculos.flatMap((v, vi) => v.paradas.map((p, pi) => ({
      id: `pdf-${vi}-${pi}`,
      placa_norm: v.placa_norm,
      chegada: p.chegada.toISOString(),
      saida: p.saida ? p.saida.toISOString() : null,
      duracao_seg: p.duracao_seg,
      local_parada: p.local_parada,
      codigo_loja: p.codigo_loja,
      nome_loja: p.nome_loja,
      lat: p.lat,
      lng: p.lng,
      endereco: p.endereco,
      classificacao: p.classificacao,
      ordem: p.ordem,
    })))

    // 4b) refina a classificação: parada FORA_BASE que cai dentro do raio de uma
    // loja cadastrada NÃO é indevida (o parser puro do PDF não conhece todas as
    // lojas e marcaria entregas legítimas como risco). Evita inflar o número.
    const { data: canon } = await svc.from('canonical_loja')
      .select('lat, lng, raio_metros').not('lat', 'is', null).not('lng', 'is', null)
    const lojas = ((canon ?? []) as Array<{ lat: number; lng: number; raio_metros: number | null }>)
      .map(c => ({ lat: c.lat, lng: c.lng, raio: c.raio_metros ?? 150 }))
    if (lojas.length) {
      for (const p of paradaRows) {
        if (p.classificacao === 'FORA_BASE' && p.lat != null && p.lng != null) {
          const emLoja = lojas.some(l => haversine(p.lat as number, p.lng as number, l.lat, l.lng) <= l.raio)
          if (emLoja) p.classificacao = 'LOJA'
        }
      }
    }

    // 5) placa→rede das entradas manuais do dia (pro "por rede" no mapa)
    const { data: ents } = await svc.from('kpi_manual_entradas').select('placa, rede_id').eq('data', data).not('placa', 'is', null)
    const placaRede = new Map<string, string>(
      ((ents ?? []) as Array<{ placa: string | null; rede_id: string }>)
        .filter(e => e.placa).map(e => [e.placa as string, e.rede_id]),
    )

    // 6) monta e salva (só sobe se ficar mais completo)
    const r = await salvarResumoSeMelhor(svc, data, montarResumoDeParadaRows(paradaRows, placaRede))
    return { ok: true, paradas: r.agora }
  } catch {
    return { ok: false, motivo: 'erro' }
  }
}
