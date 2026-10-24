// src/lib/kpi-rioquality/enviar-monitoramento-rq.ts
//
// Manda o romaneio da Rio Quality (dados da Fusion) pro Monitoramento, pros
// 118 carros RQ aparecerem no mapa (modo Romaneio). A RQ não sobe PDF: envia
// as linhas estruturadas pro endpoint /api/romaneio/rioquality, com a data do
// dia FIXA (hojeBR) -- o Monitoramento geocodifica no cron. Fail-open: nunca
// lança (o tick segue).
import { montarEnderecoBrutoCompleto, type EntregaRioQualityCompleta } from './parse-planilhas'
import { normPlaca } from '@/lib/unitrac-api'
import { coordenadasConfiaveisDoCache } from '@/lib/kpi-romaneio/geocode'

/** cod_user_unitrac da Rio Quality no monitoramento (clientes). */
export const COD_MONITORAMENTO_RQ = '598'

// F2-02 (GEO-21): campos estruturados + o texto que o parser do monitoramento
// le ("RUA, NUM - BAIRRO, CIDADE - UF", o mesmo que o KPI geocodifica). Antes
// ia "RUA, CIDADE - RJ" e o parser lia a cidade como numero. O monitoramento
// antigo so' le enderecoBruto, o novo monta pelos campos.
// F2-04 (D-21b): pedidoErp e' a chave interna que liga a NF real da planilha
// ao pedido que a Fusion usa como NF. lat/lng: coordenada que o KPI ja'
// resolveu (cache), para o mapa mostrar o mesmo ponto do Ao vivo.
export type LinhaMonitoramentoRQ = {
  placa: string; nf: string; pedidoErp: string | null; clienteCodigo: string; clienteNome: string
  rua: string; numero: string | null; bairro: string; cidade: string; uf: string; cep: string | null
  enderecoBruto: string; lat?: number; lng?: number
}

/** Monta as linhas pro Monitoramento. Só entregas com placa e NF (NF é NOT NULL
 *  em romaneio_pontos). NF repetida ganha o MESMO sufixo da geração
 *  (montarLinhasRomaneioCompleto conta todas as entregas, com ou sem placa),
 *  senão a coordenada do mapa não casa com a NF do KPI. */
export function linhasParaMonitoramentoRQ(
  entregas: EntregaRioQualityCompleta[], coords: Map<string, { lat: number; lng: number }> = new Map(),
): LinhaMonitoramentoRQ[] {
  const usadas = new Map<string, number>()
  const out: LinhaMonitoramentoRQ[] = []
  for (const e of entregas) {
    if (!e.nf) continue
    const k = (usadas.get(e.nf) ?? 0) + 1
    usadas.set(e.nf, k)
    if (!e.placaNorm) continue
    const uf = e.uf || 'RJ'
    const enderecoBruto = montarEnderecoBrutoCompleto(e.rua, e.bairro ?? '', e.cidade ?? '', uf)
    const c = coords.get(enderecoBruto)
    out.push({
      placa: e.placaNorm,
      nf: k === 1 ? e.nf : `${e.nf}-${k}`,
      pedidoErp: e.pedidoErp ?? null,
      clienteCodigo: e.clienteCodigo ?? '',
      clienteNome: e.clienteNome ?? '',
      rua: e.rua, numero: null, bairro: e.bairro ?? '', cidade: e.cidade ?? '', uf, cep: null,
      enderecoBruto,
      ...(c ? { lat: c.lat, lng: c.lng } : {}),
    })
  }
  return out
}

/** linhasParaMonitoramentoRQ com a coordenada do cache do KPI (só leitura,
 *  sem rede). Fail-open: sem cache, vai sem coordenada (o monitoramento geocodifica). */
export async function linhasComCoordenadasRQ(entregas: EntregaRioQualityCompleta[]): Promise<LinhaMonitoramentoRQ[]> {
  const enderecos = linhasParaMonitoramentoRQ(entregas).map(l => l.enderecoBruto)
  const coords = await coordenadasConfiaveisDoCache(enderecos).catch(() => new Map<string, { lat: number; lng: number }>())
  return linhasParaMonitoramentoRQ(entregas, coords)
}

/** Coordenadas que o Monitoramento já geocodificou pros pontos do dia
 *  (cascata completa + fallback Unitrac). O geocoder do KPII é mais fraco e
 *  deixa ~359 NFs da RQ "sem coordenada"; isto fecha o grosso com a MESMA
 *  coordenada do mapa. Chave: `${placaNorm}|${nf}`. Fail-open (mapa vazio no erro). */
export async function buscarCoordenadasMonitoramentoRQ(data: string): Promise<Map<string, { lat: number; lng: number }>> {
  const m = new Map<string, { lat: number; lng: number }>()
  const chave = process.env.MOTOR_SECRET
  if (!chave) return m
  try {
    const r = await fetch(`${process.env.MONITORAMENTO_URL ?? 'http://127.0.0.1:3010'}/api/romaneio/coordenadas-rioquality?data=${encodeURIComponent(data)}`, {
      headers: { 'x-motor-key': chave }, signal: AbortSignal.timeout(20_000),
    })
    const j = (await r.json().catch(() => ({}))) as { pontos?: { placa?: string; nf?: string; lat?: number; lng?: number }[] }
    for (const p of j.pontos ?? []) {
      if (p.placa && p.nf && typeof p.lat === 'number' && typeof p.lng === 'number') {
        m.set(`${normPlaca(p.placa)}|${p.nf}`, { lat: p.lat, lng: p.lng })
      }
    }
  } catch { /* fail-open: sem coordenada do monitoramento, cai no comportamento atual */ }
  return m
}

/** Resposta do envio. Revisao Fase 2 (F2-04-a): linhasApagadas e o aviso de
 *  substituicao recusada (envio vazio/encolhido) voltam ao chamador -- antes
 *  so' o erro aparecia, e o monitoramento apagava o dia em silencio. */
export type ResultadoEnvioRQ = { ok: boolean; linhasInseridas?: number; linhasApagadas?: number; linhasDoDia?: number; aviso?: string; erro?: string }

/** Linha de log do envio, ou null quando nao ha' nada a dizer (envio limpo). */
export function resumoEnvioRQ(data: string, r: ResultadoEnvioRQ): string | null {
  if (!r.ok) return `monitoramento RQ ${data}: erro ${r.erro ?? 'desconhecido'}`
  if (r.aviso) return `monitoramento RQ ${data}: substituir recusado -- ${r.aviso}`
  if ((r.linhasApagadas ?? 0) > 0) return `monitoramento RQ ${data}: ${r.linhasApagadas} linha(s) apagada(s)${typeof r.linhasDoDia === 'number' ? ` (dia com ${r.linhasDoDia})` : ''}`
  return null
}

/** Envia o dia da RQ. modo "substituir" (F2-04): o monitoramento deixa o
 *  dia da RQ igual a estas linhas (a planilha manual troca a versão da
 *  Fusion; a Fusion troca a manual quando o dia volta a ela). O monitoramento
 *  antigo ignora o modo e só acrescenta. `enviadoPor`: e-mail de quem subiu
 *  a planilha, ou "cron-fusion". */
export async function enviarRioQualityAoMonitoramento(
  data: string, linhas: LinhaMonitoramentoRQ[], opcoes: { enviadoPor?: string | null } = {},
): Promise<ResultadoEnvioRQ> {
  const chave = process.env.MOTOR_SECRET
  if (!chave) return { ok: false, erro: 'MOTOR_SECRET ausente' }
  // Cabeçalho HTTP só aceita latin1: o que não for ASCII simples vira "?".
  const enviadoPor = (opcoes.enviadoPor || 'cron-fusion').replace(/[^\x20-\x7e]/g, '?').slice(0, 80)
  try {
    const r = await fetch(`${process.env.MONITORAMENTO_URL ?? 'http://127.0.0.1:3010'}/api/romaneio/rioquality`, {
      method: 'POST',
      headers: { 'x-motor-key': chave, 'content-type': 'application/json', 'x-enviado-por': enviadoPor },
      body: JSON.stringify({ data, modo: 'substituir', linhas }),
      // 3 mil linhas na primeira troca de versão: o monitoramento grava em lotes.
      signal: AbortSignal.timeout(60_000),
    })
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; linhasInseridas?: number; linhasApagadas?: number; linhasDoDia?: number; aviso?: unknown; erro?: string }
    return j.ok
      ? {
          ok: true, linhasInseridas: j.linhasInseridas,
          ...(typeof j.linhasApagadas === 'number' ? { linhasApagadas: j.linhasApagadas } : {}),
          ...(typeof j.linhasDoDia === 'number' ? { linhasDoDia: j.linhasDoDia } : {}),
          ...(typeof j.aviso === 'string' && j.aviso ? { aviso: j.aviso } : {}),
        }
      : { ok: false, erro: j.erro ?? `HTTP ${r.status}` }
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : String(err) }
  }
}

/** Linhas da RQ no monitoramento no dia (frota da RQ + placas fora do
 *  cadastro gravadas pela ponte). null = não deu pra saber. O monitoramento
 *  antigo ignora `rq=1` e conta só a frota (o tick então reenvia a mais,
 *  sem estrago: o envio é idempotente). */
export async function contarRioQualityNoMonitoramento(data: string): Promise<number | null> {
  const chave = process.env.MOTOR_SECRET
  if (!chave) return null
  const base = process.env.MONITORAMENTO_URL ?? 'http://127.0.0.1:3010'
  try {
    const r = await fetch(`${base}/api/romaneio/contagem?data=${encodeURIComponent(data)}&cod=${COD_MONITORAMENTO_RQ}&rq=1`, {
      headers: { 'x-motor-key': chave }, signal: AbortSignal.timeout(15_000),
    })
    if (!r.ok) return null
    const j = (await r.json().catch(() => ({}))) as { linhas?: unknown }
    return typeof j.linhas === 'number' ? j.linhas : null
  } catch {
    return null
  }
}
