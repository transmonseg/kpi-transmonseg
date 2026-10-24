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

const DIST_MAX_DO_GEO_M = 15_000

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

/** Parada crua da Unitrac, só o que a trava de 15 km precisa. */
export type ParadaPropria = {
  lat: number | null
  lng: number | null
  chegada: string
  saida?: string | null
  fim_real?: string | null
  duracao_seg?: number | null
  classificacao?: string | null
}

const PARADA_PROPRIA_MIN_S = 180
const PARADA_PROPRIA_RAIO_M = 100

/** F1-07 (KN-04 parte 1): a própria placa parou >= 3 min a <= 100 m do ponto
 *  aprendido, fora da base. */
export function paradaPropriaNoLocal(paradas: ParadaPropria[], local: { lat: number; lng: number }): boolean {
  return paradas.some(p => {
    if (p.classificacao !== 'FORA_BASE' || p.lat == null || p.lng == null) return false
    const fim = p.fim_real ?? p.saida ?? p.chegada
    const dur = p.duracao_seg ?? (new Date(fim).getTime() - new Date(p.chegada).getTime()) / 1000
    if (!(dur >= PARADA_PROPRIA_MIN_S)) return false
    return distanciaM({ lat: p.lat, lng: p.lng }, local) <= PARADA_PROPRIA_RAIO_M
  })
}

/** NF do MESMO endereço do local (chave do cache: sem o sufixo de CEP). */
function mesmoEnderecoDoLocal(l: LinhaGeocodificada, local: LocalCliente): boolean {
  return local.enderecoRef != null && chaveCacheEndereco(l.endereco.trim().toUpperCase()) === chaveCacheEndereco(local.enderecoRef.trim().toUpperCase())
}

function normPlacaLocal(p: string): string {
  return (p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** NFs com geocode do dia NÃO confiável que a trava de 15 km barra hoje --
 *  só pra elas vale buscar as paradas da placa antes da ponte (F1-07). */
export function nfsBarradasPelaTrava(linhas: LinhaGeocodificada[], locais: Map<string, LocalCliente>): LinhaGeocodificada[] {
  return linhas.filter(l => {
    const chave = chaveClienteLocal(l)
    const local = chave ? locais.get(chave) : undefined
    if (!local || !localUtilizavel(local)) return false
    if (l.lat == null || l.lng == null || l.geoConfiavel !== false) return false
    return distanciaM(l as { lat: number; lng: number }, local) > DIST_MAX_DO_GEO_M && mesmoEnderecoDoLocal(l, local)
  })
}

/** Troca a coordenada das NFs cujo cliente tem local utilizável.
 *  Medido 06/10 (01-05/10, com x sem cadastro): trocar geocode BOM piorava
 *  NFs em dois casos -- cliente que entrega em vários endereços (buffet de
 *  evento, rede; mesmo código, outro lugar) e local aprendido de entrega
 *  confirmada "atrasado" (média de geocodes antigos, já corrigidos depois).
 *  Por isso:
 *   - geocode do dia ruim/ausente: usa o local (qualquer fonte utilizável);
 *   - geocode do dia bom: só manual ou parada órfã, e só no MESMO endereço;
 *     entrega confirmada nunca troca geocode bom.
 *  F1-07 (KN-04 parte 1, Jacaré 22/10: geocode a 84 km): com geocode do dia
 *  NÃO confiável, o local passa da trava de 15 km quando a PRÓPRIA placa
 *  parou >= 3 min a <= 100 m dele no dia (`paradasPropriasPorPlaca`, chave =
 *  placa normalizada). Geocode confiável continua travado (VIVACE).
 *  R3 (revisão Fase 1): e só quando a NF é do MESMO endereço do local
 *  (enderecoRef, pela chave do cache): o local é por código do cliente e a
 *  parada que entregou o endereço do Rio não pode destravar a NF de Campos. */
export function aplicarLocaisClientes(
  linhas: LinhaGeocodificada[],
  locais: Map<string, LocalCliente>,
  paradasPropriasPorPlaca?: Map<string, ParadaPropria[]>,
): { linhas: LinhaGeocodificada[]; aplicados: string[] } {
  const aplicados: string[] = []
  const novas = linhas.map(l => {
    const chave = chaveClienteLocal(l)
    const local = chave ? locais.get(chave) : undefined
    if (!local || !localUtilizavel(local)) return l
    const temGeo = l.lat != null && l.lng != null
    // Coordenada ruim erra por poucos km, não de cidade: local muito longe é
    // de outro endereço do cliente (VIVACE: Rio x Campos, 156 km).
    if (temGeo && distanciaM(l as { lat: number; lng: number }, local) > DIST_MAX_DO_GEO_M) {
      const destrava = l.geoConfiavel === false && mesmoEnderecoDoLocal(l, local) && paradaPropriaNoLocal(paradasPropriasPorPlaca?.get(normPlacaLocal(l.placa)) ?? [], local)
      if (!destrava) return l
    }
    const geoBom = temGeo && l.geoConfiavel !== false
    if (geoBom) {
      if (local.fonte === 'entrega_confirmada') return l
      if (!mesmoEnderecoDoLocal(l, local)) return l
    }
    aplicados.push(l.nf)
    // "Verificada" (regra de parada compartilhada com vizinho) só pra correção
    // manual: com o aprendido, em centro de cidade com clientes a <300 m, a NF
    // passava a "explicar" a parada das vizinhas (RQV9B26 01/10, 3 NFs).
    // Confiabilidade: só a correção manual vira confiável. O aprendido mantém a
    // da coordenada do dia -- marcar confiável deixava a NF tirar conclusão
    // negativa e "explicar" parada das vizinhas (RQV9B26 01/10, -4 NFs).
    if (local.fonte !== 'manual') return { ...l, lat: local.lat, lng: local.lng }
    return { ...l, lat: local.lat, lng: local.lng, geoConfiavel: true, geoMotivo: undefined, geoSemFonte: false, geoVerificadoManual: true, geoFonte: 'manual' }
  })
  return { linhas: novas, aplicados }
}

const DIST_MAX_CORROBORA_M = 150

/** Auditoria 20/10 (GN-01): marca as NFs cujo ponto do dia bate (<= 150 m)
 *  com um local utilizável do cliente -- o ponto foi confirmado por outra
 *  fonte, então parada a 500 m-2 km dele não é este cliente. */
export function marcarPontosCorroborados(linhas: LinhaGeocodificada[], locais: Map<string, LocalCliente>): LinhaGeocodificada[] {
  return linhas.map(l => {
    if (l.lat == null || l.lng == null) return l
    const chave = chaveClienteLocal(l)
    const local = chave ? locais.get(chave) : undefined
    if (!local || !localUtilizavel(local)) return l
    if (distanciaM(l as { lat: number; lng: number }, local) > DIST_MAX_CORROBORA_M) return l
    return { ...l, pontoCorroborado: true }
  })
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
export async function buscarLocaisClientes(empresa: string, aoFalhar?: () => void): Promise<Map<string, LocalCliente>> {
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
    aoFalhar?.()
    return new Map()
  }
}
