// F2-01 (b), achado 23/10: quando a ponte de coerencia do monitoramento falha
// (500 por statement timeout em cnefe_candidatos_por_rua), o corredor da rua
// some daquele tick e 7 a 68 entregues caiam entre ticks. Os pontos CNEFE de
// uma rua nao mudam no dia: a ultima resposta boa da ponte fica guardada por
// 1 dia em kpi_cache_dia (tabela que ja' existe, sem migration) e e' usada
// SO' quando a ponte falha. A chave e' a rua como a ponte recebe; a resposta
// traz o municipio (IBGE) de cada ponto e o corredor filtra pelo municipio do
// endereco (corredor-rua.ts), entao a chave cobre rua + municipio.
// Fail-open: qualquer erro de leitura/gravacao vira "sem cache".
import { createServiceClient } from '@/lib/supabase/service'
import type { PontoZona } from './geocode-coerencia'

export const PREFIXO_CACHE_CORREDOR = 'corredor-rua'
/** Validade da resposta guardada (pedido do plano: 1 dia). */
export const VALIDADE_CACHE_CORREDOR_MS = 24 * 3600_000
/** Resposta guardada ha' menos que isto nao e' regravada (o tick roda a cada
 *  10 min; regravar tudo toda vez so' gastaria escrita). */
export const REGRAVAR_CACHE_CORREDOR_APOS_MS = 6 * 3600_000

type ClienteCache = Pick<ReturnType<typeof createServiceClient>, 'from'>
type Opcoes = { agoraMs?: number; cliente?: () => ClienteCache }

function chaveCorredor(data: string, rua: string): string {
  return `${PREFIXO_CACHE_CORREDOR}:${data}|${rua}`
}
function ruaDaChave(data: string, chave: string): string | null {
  const prefixo = `${PREFIXO_CACHE_CORREDOR}:${data}|`
  return chave.startsWith(prefixo) ? chave.slice(prefixo.length) : null
}

function pontosValidos(v: unknown): PontoZona[] | null {
  if (!Array.isArray(v)) return null
  return v
    .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
    .map(p => ({ lat: Number(p.lat), lng: Number(p.lng), municipioCodigo: typeof p.municipioCodigo === 'string' ? p.municipioCodigo : null }))
    .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng))
}

async function linhasDoDia(cliente: ClienteCache, data: string, colunas: string): Promise<{ chave: string; valor?: unknown; gravado_em: string }[]> {
  const { data: linhas, error } = await cliente.from('kpi_cache_dia').select(colunas)
    .eq('data', data).like('chave', `${PREFIXO_CACHE_CORREDOR}:${data}|%`)
  if (error) throw new Error(error.message)
  return (Array.isArray(linhas) ? linhas : []) as unknown as { chave: string; valor?: unknown; gravado_em: string }[]
}

/** Pontos das ruas pedidas guardados ha' menos de 1 dia (rua -> pontos). */
export async function lerCorredorDoCache(data: string, ruas: string[], opcoes: Opcoes = {}): Promise<Map<string, PontoZona[]>> {
  const saida = new Map<string, PontoZona[]>()
  if (ruas.length === 0) return saida
  try {
    const agora = opcoes.agoraMs ?? Date.now()
    const pedidas = new Set(ruas)
    for (const l of await linhasDoDia((opcoes.cliente ?? createServiceClient)(), data, 'chave, valor, gravado_em')) {
      const rua = ruaDaChave(data, l.chave)
      if (rua == null || !pedidas.has(rua)) continue
      if (!(agora - Date.parse(l.gravado_em) < VALIDADE_CACHE_CORREDOR_MS)) continue
      const pontos = pontosValidos(l.valor)
      if (pontos) saida.set(rua, pontos)
    }
  } catch (err) {
    console.error(`${new Date().toISOString()} [kpi-rioquality/cache-corredor] leitura falhou:`, err instanceof Error ? err.message : err)
  }
  return saida
}

/** Guarda a resposta boa da ponte; pula rua guardada ha' menos de 6 h.
 *  Devolve quantas ruas gravou. */
export async function gravarCorredorNoCache(data: string, pontosPorRua: Map<string, PontoZona[]>, opcoes: Opcoes = {}): Promise<number> {
  if (pontosPorRua.size === 0) return 0
  try {
    const agora = opcoes.agoraMs ?? Date.now()
    const cliente = (opcoes.cliente ?? createServiceClient)()
    const recentes = new Set<string>()
    for (const l of await linhasDoDia(cliente, data, 'chave, gravado_em')) {
      const rua = ruaDaChave(data, l.chave)
      if (rua != null && agora - Date.parse(l.gravado_em) < REGRAVAR_CACHE_CORREDOR_APOS_MS) recentes.add(rua)
    }
    const gravadoEm = new Date(agora).toISOString()
    const linhas = [...pontosPorRua].filter(([rua]) => !recentes.has(rua))
      .map(([rua, pontos]) => ({ chave: chaveCorredor(data, rua), data, valor: pontos, gravado_em: gravadoEm }))
    for (let i = 0; i < linhas.length; i += 200) {
      const { error } = await cliente.from('kpi_cache_dia').upsert(linhas.slice(i, i + 200), { onConflict: 'chave' })
      if (error) throw new Error(error.message)
    }
    return linhas.length
  } catch (err) {
    console.error(`${new Date().toISOString()} [kpi-rioquality/cache-corredor] gravação falhou:`, err instanceof Error ? err.message : err)
    return 0
  }
}
