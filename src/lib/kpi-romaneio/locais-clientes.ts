// Cadastro de locais dos clientes (pedido 05/10): cada cliente da Nutry Max
// (código do cliente no romaneio) guarda a coordenada boa dele, aprendida de
// entregas confirmadas, de paradas reais do caminhão perto do endereço ou de
// correção manual. A geração do KPI (normal e ao vivo) usa esse cadastro
// antes da geocodificação por texto -- o mesmo cliente às vezes vem com o
// endereço escrito diferente, e aí a correção feita num dia se perdia.
import { createServiceClient } from '@/lib/supabase/service'
import { chaveCacheEndereco } from './endereco-cep'
import type { LinhaGeocodificada } from './types'

export type FonteLocal = 'manual' | 'entrega_confirmada' | 'parada_orfa'
export type LocalCliente = {
  chave: string
  lat: number
  lng: number
  /** Lugar grande (estádio, fábrica): raio maior pra contar a entrega. */
  raioM: number | null
  fonte: FonteLocal
  confirmacoes: number
  enderecoRef: string | null
}

const DIST_MUDOU_ENDERECO_M = 2000

function distanciaM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000
  const rad = (x: number) => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Código do cliente no romaneio principal. No pão o "código" é a própria NF
 *  (muda todo dia): não serve de chave -- o pão segue pelo cache de endereço. */
export function chaveClienteLocal(l: { carga: string; clienteCodigo: string }): string | null {
  if (/^PAO-/i.test(l.carga)) return null
  const c = (l.clienteCodigo ?? '').trim()
  return c ? c : null
}

/** Correção manual vale na hora; o aprendido precisa de 2 confirmações em
 *  dias diferentes que concordem. */
export function localUtilizavel(l: LocalCliente): boolean {
  return l.fonte === 'manual' || l.confirmacoes >= 2
}

/** Troca a coordenada das NFs cujo cliente tem local utilizável. Não troca
 *  quando o texto do endereço mudou e o geocode novo é confiável e longe
 *  (> 2 km): provável cliente que mudou de endereço. */
export function aplicarLocaisClientes(linhas: LinhaGeocodificada[], locais: Map<string, LocalCliente>): { linhas: LinhaGeocodificada[]; aplicados: string[] } {
  const aplicados: string[] = []
  const novas = linhas.map(l => {
    const chave = chaveClienteLocal(l)
    const local = chave ? locais.get(chave) : undefined
    if (!local || !localUtilizavel(local)) return l
    const mesmoEndereco = local.enderecoRef != null && chaveCacheEndereco(l.endereco.trim().toUpperCase()) === chaveCacheEndereco(local.enderecoRef.trim().toUpperCase())
    if (!mesmoEndereco && l.geoConfiavel !== false && l.lat != null && l.lng != null && distanciaM(l as { lat: number; lng: number }, local) > DIST_MUDOU_ENDERECO_M) return l
    aplicados.push(l.nf)
    return { ...l, lat: local.lat, lng: local.lng, geoConfiavel: true, geoMotivo: undefined, geoSemFonte: false, geoVerificadoManual: true }
  })
  return { linhas: novas, aplicados }
}

/** Local aprendido a partir das evidências (uma por dia): mediana das que
 *  concordam entre si (até 200 m da mediana geral). */
export function consolidarEvidencias(evs: { lat: number; lng: number }[]): { lat: number; lng: number; confirmacoes: number } | null {
  if (!evs.length) return null
  const mediana = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
  const centro = { lat: mediana(evs.map(e => e.lat)), lng: mediana(evs.map(e => e.lng)) }
  const juntas = evs.filter(e => distanciaM(e, centro) <= 200)
  if (!juntas.length) return null
  return { lat: mediana(juntas.map(e => e.lat)), lng: mediana(juntas.map(e => e.lng)), confirmacoes: juntas.length }
}

/** Locais da empresa. Falha de leitura não quebra a geração (fail-open). */
export async function buscarLocaisClientes(empresa: string): Promise<Map<string, LocalCliente>> {
  try {
    const { data, error } = await createServiceClient().from('kpi_cliente_local')
      .select('cliente_codigo, lat, lng, raio_m, fonte, confirmacoes, endereco_ref').eq('empresa', empresa)
    if (error) throw new Error(error.message)
    return new Map((data ?? []).map(r => [r.cliente_codigo as string, {
      chave: r.cliente_codigo as string, lat: Number(r.lat), lng: Number(r.lng), raioM: (r.raio_m as number | null) ?? null,
      fonte: r.fonte as FonteLocal, confirmacoes: Number(r.confirmacoes), enderecoRef: (r.endereco_ref as string | null) ?? null,
    }]))
  } catch (err) {
    console.error('cadastro de locais dos clientes indisponivel:', err)
    return new Map()
  }
}
