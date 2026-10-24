import type { OfertaFechamento } from '@/lib/kpi-romaneio/fechamento-dashboard'

// F3-R08: resposta do GET /api/dashboard-kpi/fechamento para o cartão
// "Fechamento disponível". 401/403 = quem não insere KPI (nada a mostrar);
// outro erro = aviso na tela, nunca "sem oferta" calado.
export async function lerRespostaOfertas(r: { ok: boolean; status: number; json: () => Promise<unknown> }): Promise<{ ofertas: OfertaFechamento[]; erro: string | null }> {
  if (r.status === 401 || r.status === 403) return { ofertas: [], erro: null }
  const ERRO = 'Não consegui conferir se há fechamento disponível para este período. Recarregue a tela em instantes.'
  if (!r.ok) return { ofertas: [], erro: ERRO }
  const j = await r.json().catch(() => null) as { ofertas?: OfertaFechamento[] } | null
  if (!j || !Array.isArray(j.ofertas)) return { ofertas: [], erro: ERRO }
  return { ofertas: j.ofertas, erro: null }
}
