// Auditoria 07/10 (2.408 NFs conferidas contra o GPS do monitoramento): 26
// NFs sairam ENTREGUE por uma parada a 2-134 km do endereco do romaneio, em
// outro bairro ou municipio, sem nenhum aviso (a divergencia de cadastro so'
// era conferida nas pendentes).
//
// Depois do detalhe montado: ENTREGUE cuja parada fica a > LIMIAR_M do
// geocode confiavel, sem nenhuma parada da placa no endereco no dia inteiro,
// pergunta ao monitoramento se a parada cai no municipio/bairro do endereco
// (mesma guarda territorial do geocode). Fora do territorio: continua ENTREGUE
// com aviso pra corrigir o cadastro (e a NF na aba Avisos), dizendo quando a
// parada e' o endereco de OUTRO cliente no mesmo horario. Nunca derruba:
// medido em 14 dias (22/09-07/10), 32 clientes caem aqui em dias diferentes
// sempre no MESMO ponto (o cliente fica la', o endereco do romaneio e' que esta'
// errado), o gabarito da equipe tem entrega real nesse grupo (24/09) e ate' o
// "ponto de outro cliente" pega vizinho recorrente (PARME, BAR DA ELA).
// Distancia sozinha nao serve: na auditoria, 69 entregas reais tinham a parada
// a >1 km do nosso ponto, mas dentro do bairro certo (ponto impreciso).
import { haversine } from '@/lib/utils/geo'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import type { AlvoApi } from '@/lib/unitrac-api/alvos'
import { acessoSomentePorBarco } from './acesso-restrito'
import { calcularConfianca, gerarMotivo, PREFIXO_OBS_PARADA_FORA_DO_ENDERECO } from './agregacao'
import type { LinhaDetalheEntrega, LinhaGeocodificada } from './types'

/** Parada a mais que isso do geocode e' candidata (abaixo, outras regras ja' cuidam). */
const LIMIAR_M = 1_000
/** Parada da placa a ate' isso do endereco, em qualquer hora do dia, e' a entrega
 *  real (horario casado com a parada errada) -- nao rebaixa. 7 casos em 07/10. */
const RAIO_PAROU_NO_ENDERECO_M = 300
const DURACAO_MIN_PAROU_NO_ENDERECO_MIN = 2
/** Folga pra casar a janela [chegada, saida] da NF com a parada. */
const FOLGA_JANELA_MS = 2 * 60_000
/** Parada a ate' isso do ponto de outro cliente e' a entrega dele (mesmo raio
 *  de RAIO_OUTRO_CLIENTE_EXPLICA_M em agregacao.ts). */
const RAIO_OUTRO_CLIENTE_M = 150

export type ContextoParadaForaDoEndereco = {
  linhaPorNf: Map<string, LinhaGeocodificada>
  alvoPorNf: Map<string, AlvoApi>
  paradasPorPlaca: Map<string, UnitracParadaRow[]>
  paradasCruasPorPlaca: Map<string, UnitracParadaRow[]>
  data: string
}

export type CandidatoParadaFora = { id: string; nf: string; lat: number; lng: number; endereco: string; distM: number; janela: [number, number] | null }
export type VereditoTerritorio = { ok: true } | { ok: false; motivo: 'municipio_divergente' | 'bairro_divergente' }
export type VerificarTerritorio = (pontos: CandidatoParadaFora[]) => Promise<Map<string, VereditoTerritorio>>

const valida = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n !== 0
const fimDa = (p: UnitracParadaRow) => p.fim_real ?? p.saida ?? p.chegada

function paradasDaPlaca(ctx: ContextoParadaForaDoEndereco, placa: string): (UnitracParadaRow & { lat: number; lng: number })[] {
  return [...(ctx.paradasPorPlaca.get(placa) ?? []), ...(ctx.paradasCruasPorPlaca.get(placa) ?? [])]
    .filter((p): p is UnitracParadaRow & { lat: number; lng: number } => p.classificacao === 'FORA_BASE' && valida(p.lat) && valida(p.lng))
}

export function candidatosParadaForaDoEndereco(detalhe: LinhaDetalheEntrega[], ctx: ContextoParadaForaDoEndereco): CandidatoParadaFora[] {
  const out: CandidatoParadaFora[] = []
  for (const d of detalhe) {
    if (d.status === 'pendente') continue
    const l = ctx.linhaPorNf.get(d.nf)
    if (!l || l.geoConfiavel === false || !valida(l.lat) || !valida(l.lng) || acessoSomentePorBarco(d.endereco)) continue
    const geo = { lat: l.lat, lng: l.lng }
    const paradas = paradasDaPlaca(ctx, d.placa)
    const paradaNoEndereco = paradas.some(p => haversine(p.lat, p.lng, geo.lat, geo.lng) <= RAIO_PAROU_NO_ENDERECO_M
      && (Date.parse(fimDa(p)) - Date.parse(p.chegada)) / 60_000 >= DURACAO_MIN_PAROU_NO_ENDERECO_MIN)
    if (paradaNoEndereco) continue
    // Lugar da parada que confirmou: a parada da placa na janela da NF mais perto
    // do endereco; sem horario (alvo feito na Unitrac), o cadastro da Unitrac.
    let ponto: { lat: number; lng: number } | null = null
    let janela: [number, number] | null = null
    if (d.chegada && d.saida) {
      const ini = Date.parse(d.chegada) - FOLGA_JANELA_MS, fim = Date.parse(d.saida) + FOLGA_JANELA_MS
      janela = [ini, fim]
      let melhor = Infinity
      for (const p of paradas) {
        if (Date.parse(fimDa(p)) < ini || Date.parse(p.chegada) > fim) continue
        const dd = haversine(p.lat, p.lng, geo.lat, geo.lng)
        if (dd < melhor) { melhor = dd; ponto = { lat: p.lat, lng: p.lng } }
      }
    } else {
      const a = ctx.alvoPorNf.get(d.nf)
      if (a?.situacao === 1 && valida(a.pontoLat) && valida(a.pontoLng)) ponto = { lat: a.pontoLat, lng: a.pontoLng }
    }
    if (!ponto) continue
    const distM = haversine(ponto.lat, ponto.lng, geo.lat, geo.lng)
    if (distM <= LIMIAR_M) continue
    out.push({ id: d.nf, nf: d.nf, lat: ponto.lat, lng: ponto.lng, endereco: d.endereco, distM, janela })
  }
  return out
}

/** Pergunta ao monitoramento (rota /api/romaneio/territorio). Erro lanca --
 *  conferirParadaForaDoEndereco trata como "sem veredito". */
export const verificarTerritorioNaPonte: VerificarTerritorio = async pontos => {
  const chave = process.env.MOTOR_SECRET
  if (!chave) throw new Error('MOTOR_SECRET ausente')
  const r = await fetch(`${process.env.MONITORAMENTO_URL ?? 'http://127.0.0.1:3010'}/api/romaneio/territorio`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-motor-key': chave },
    body: JSON.stringify({ pontos: pontos.map(p => ({ id: p.id, lat: p.lat, lng: p.lng, endereco: p.endereco })) }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!r.ok) throw new Error(`territorio HTTP ${r.status}`)
  const j = (await r.json()) as { resultados?: { id: string; ok: boolean | null; motivo?: 'municipio_divergente' | 'bairro_divergente' }[] }
  const m = new Map<string, VereditoTerritorio>()
  for (const x of j.resultados ?? []) {
    if (x.ok === true) m.set(x.id, { ok: true })
    else if (x.ok === false && x.motivo) m.set(x.id, { ok: false, motivo: x.motivo })
  }
  return m
}

/** Nunca derruba a geracao: erro/sem resposta da ponte = nada muda (fail-open,
 *  igual a guarda territorial do geocode). */
export async function conferirParadaForaDoEndereco(
  detalhe: LinhaDetalheEntrega[], ctx: ContextoParadaForaDoEndereco, verificar: VerificarTerritorio,
): Promise<LinhaDetalheEntrega[]> {
  const candidatos = candidatosParadaForaDoEndereco(detalhe, ctx)
  if (candidatos.length === 0) return detalhe
  let vereditos: Map<string, VereditoTerritorio>
  try {
    vereditos = await verificar(candidatos)
  } catch (err) {
    console.error('[kpi] conferencia de parada fora do endereco indisponivel -- nada rebaixado', err)
    return detalhe
  }
  const porNf = new Map(candidatos.map(c => [c.nf, c]))
  // A parada e' o ENDERECO (geocode confiavel) de outro cliente (codigo e
  // endereco diferentes) da mesma placa, entregue numa janela que cruza a desta
  // NF? So' o geocode do outro vale: o cadastro Unitrac dele no ponto seria
  // circular (22/09: dois clientes "se explicando" pelo cadastro, os dois com
  // endereco a 14 km) -- e o outro nao pode estar na mesma situacao.
  const deOutroCliente = (d: LinhaDetalheEntrega, c: CandidatoParadaFora): boolean => {
    if (!c.janela) return false
    const [ini, fim] = c.janela
    return detalhe.some(o => {
      if (o.nf === d.nf || o.placa !== d.placa || o.status === 'pendente' || !o.chegada || !o.saida || porNf.has(o.nf)) return false
      if ((o.clienteCodigo?.trim() && o.clienteCodigo.trim() === d.clienteCodigo?.trim()) || o.endereco === d.endereco) return false
      if (Date.parse(o.saida) < ini || Date.parse(o.chegada) > fim) return false
      const l = ctx.linhaPorNf.get(o.nf)
      return !!l && l.geoConfiavel !== false && valida(l.lat) && valida(l.lng) && haversine(l.lat, l.lng, c.lat, c.lng) <= RAIO_OUTRO_CLIENTE_M
    })
  }
  let avisadas = 0, deOutro = 0
  const out = detalhe.map(d => {
    const c = porNf.get(d.nf)
    const v = c ? vereditos.get(c.id) : undefined
    if (!c || !v || v.ok || d.observacao != null) return d
    avisadas++
    const km = (c.distM / 1000).toFixed(1).replace('.', ',')
    const onde = v.motivo === 'municipio_divergente' ? 'OUTRO MUNICÍPIO' : 'OUTRO BAIRRO'
    const outro = deOutroCliente(d, c)
    if (outro) deOutro++
    const n: LinhaDetalheEntrega = { ...d, observacao: `${PREFIXO_OBS_PARADA_FORA_DO_ENDERECO} (${km} km, ${onde}${outro ? ', NO PONTO DE OUTRO CLIENTE' : ''}) - CORRIGIR CADASTRO`, distParadaM: Math.round(c.distM) }
    n.confianca = calcularConfianca(n.status, n.observacao)
    n.motivo = gerarMotivo({ status: n.status, observacao: n.observacao, evidencia: n.evidencia, distParadaM: n.distParadaM, tempoParadaMin: n.tempoParadaMin })
    return n
  })
  if (avisadas > 0) console.log(`[kpi] ${ctx.data}: ${avisadas} entregue(s) fora do bairro/municipio do endereco -> aviso de cadastro (${deOutro} no ponto de outro cliente)`)
  return out
}
