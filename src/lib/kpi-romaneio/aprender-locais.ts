// Aprendizado do cadastro de locais dos clientes (05/10). Puro: recebe o que
// a geração do KPI viu no dia (detalhe por NF + coordenada usada), as paradas
// do monitoramento por placa e a geocodificação independente das NFs não
// confirmadas, e devolve as evidências do dia. escolherLocal decide, com
// todas as evidências de um cliente, qual coordenada vale.
import { chaveClienteLocal, consolidarEvidencias, type FonteLocal } from './locais-clientes'
import { normPlaca } from '@/lib/unitrac-api'
import type { LinhaDetalheEntrega } from './types'
import type { ParadaBridge } from './base-horarios'

export type EvidenciaLocal = {
  chave: string
  nome: string
  nf: string
  endereco: string
  origem: Exclude<FonteLocal, 'manual'>
  lat: number
  lng: number
  distGeocodeM: number | null
  detalhe: string
}

const DIST_CONFIRMACAO_FORTE_M = 300 // parada no endereço até aqui ensina o local
const MIN_PARADA_ORFA_S = 8 * 60
const RAIO_CANDIDATA_M = 400 // parada até aqui do endereço achado por fora
const LONGE_DE_OUTRA_ENTREGA_M = 250
const PERTO_DO_NOSSO_PONTO_M = 300 // parada aqui não é problema de endereço
// Entrega confirmada pelo CADASTRO da Unitrac (09/10, auditoria da geocodificação):
// feito da Unitrac + parada a <= CAD_PARADA_MAX_M do cadastro + nosso geocode entre
// CAD_GEO_MIN_M e CAD_GEO_MAX_M do cadastro. Menos de 300 m é imprecisão, mais de 3 km
// é suspeito demais pra aprender sozinho (vira lista pra revisão humana).
const CAD_PARADA_MAX_M = 150
const CAD_GEO_MIN_M = 300
const CAD_GEO_MAX_M = 3000

function distanciaM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000
  const rad = (x: number) => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function evidenciasDoDia(p: {
  detalhe: LinhaDetalheEntrega[]
  geo: Map<string, { lat: number; lng: number; confiavel: boolean }>
  paradasPorPlaca: Map<string, { apagao: boolean; paradas: ParadaBridge[] }>
  indep: Map<string, { lat: number; lng: number } | null>
  /** Ponto do cadastro do cliente na Unitrac, por NF (opcional). */
  cadastro?: Map<string, { lat: number; lng: number }>
}): EvidenciaLocal[] {
  const out: EvidenciaLocal[] = []
  const confirmada = (d: LinhaDetalheEntrega) => d.status !== 'pendente'
  // Pontos das entregas confirmadas por placa (paradas coladas nelas são delas).
  const entreguesPorPlaca = new Map<string, { lat: number; lng: number }[]>()
  for (const d of p.detalhe) {
    const g = p.geo.get(d.nf)
    if (!confirmada(d) || !g) continue
    const k = normPlaca(d.placa)
    entreguesPorPlaca.set(k, [...(entreguesPorPlaca.get(k) ?? []), g])
  }
  for (const d of p.detalhe) {
    const chave = chaveClienteLocal(d)
    if (!chave) continue
    const g = p.geo.get(d.nf)
    const base = { chave, nome: d.clienteNome, nf: d.nf, endereco: d.endereco }
    if (confirmada(d)) {
      if (d.evidencia === 'parada_no_endereco' && d.distParadaM != null && d.distParadaM <= DIST_CONFIRMACAO_FORTE_M && g?.confiavel) {
        out.push({ ...base, origem: 'entrega_confirmada', lat: g.lat, lng: g.lng, distGeocodeM: 0, detalhe: `confirmada, parada a ${d.distParadaM} m` })
      }
      const cad = p.cadastro?.get(d.nf)
      if (d.evidencia === 'parada_no_cadastro_unitrac' && d.status === 'confirmado_unitrac' && d.distParadaM != null && d.distParadaM <= CAD_PARADA_MAX_M && cad && g) {
        const dGeo = Math.round(distanciaM(cad, g))
        if (dGeo >= CAD_GEO_MIN_M && dGeo <= CAD_GEO_MAX_M) {
          out.push({ ...base, origem: 'parada_orfa', lat: cad.lat, lng: cad.lng, distGeocodeM: dGeo, detalhe: `feito da Unitrac + parada a ${Math.round(d.distParadaM)} m do cadastro; nosso ponto a ${dGeo} m do cadastro` })
        }
      }
      continue
    }
    if (d.evidencia === 'sem_rastreador' || d.evidencia === 'nao_saiu_da_base') continue
    if (/^(CARGA SEM PLACA|AGUARDANDO)/.test(d.observacao ?? '')) continue
    const fora = p.indep.get(d.nf)
    const mp = p.paradasPorPlaca.get(normPlaca(d.placa))
    if (!fora || !mp || mp.apagao) continue
    const outras = entreguesPorPlaca.get(normPlaca(d.placa)) ?? []
    const candidatas = mp.paradas.filter(x =>
      x.classificacao === 'FORA_BASE' && x.duracaoSeg >= MIN_PARADA_ORFA_S &&
      distanciaM(x, fora) <= RAIO_CANDIDATA_M &&
      outras.every(o => distanciaM(x, o) > LONGE_DE_OUTRA_ENTREGA_M))
    if (candidatas.length !== 1) continue
    const c = candidatas[0]
    const distGeo = g ? Math.round(distanciaM(c, g)) : null
    if (distGeo != null && distGeo <= PERTO_DO_NOSSO_PONTO_M) continue
    out.push({ ...base, origem: 'parada_orfa', lat: c.lat, lng: c.lng, distGeocodeM: distGeo,
      detalhe: `parada de ${Math.round(c.duracaoSeg / 60)} min a ${Math.round(distanciaM(c, fora))} m do endereço achado por fora` })
  }
  return out
}

/** Coordenada que vale pro cliente, com todas as evidências dele: manual
 *  manda; depois entrega confirmada que se repete (2+ dias concordando);
 *  depois parada órfã que se repete. Uma só evidência é guardada com 1
 *  confirmação (o KPI ainda não usa -- localUtilizavel). */
export function escolherLocal(evs: { origem: FonteLocal; lat: number; lng: number }[]): { fonte: FonteLocal; lat: number; lng: number; confirmacoes: number } | null {
  const de = (o: FonteLocal) => consolidarEvidencias(evs.filter(e => e.origem === o))
  const manual = de('manual')
  if (manual) return { fonte: 'manual', ...manual }
  const conf = de('entrega_confirmada'), orfa = de('parada_orfa')
  if (conf && conf.confirmacoes >= 2) return { fonte: 'entrega_confirmada', ...conf }
  if (orfa && orfa.confirmacoes >= 2) return { fonte: 'parada_orfa', ...orfa }
  if (conf) return { fonte: 'entrega_confirmada', ...conf }
  if (orfa) return { fonte: 'parada_orfa', ...orfa }
  return null
}
