import type { LinhaGeocodificada, Visita } from '@/lib/kpi-romaneio/types'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import { RAIO_ENTREGA_METROS } from '@/lib/kpi-romaneio/constants'
import { RAIO_VIZINHANCA_METROS, RAIO_CONFIRMACAO_AMPLIADO_METROS } from './constants'

// Casamento INCLUSIVO entrega x parada GPS -- achado real 05/09 (primeira
// geracao Rio Quality): montarVisitas da Nutry Max casa cada parada com UMA
// entrega (a mais proxima); na Rio Quality varias entregas da mesma placa
// caem na mesma rua/coordenada (romaneio sem numero) e so' uma confirmava.
// Aqui a pergunta e' feita por ENTREGA: "houve parada a <= 500m de mim?" --
// todas as que estao no raio confirmam, cada uma com a parada de maior
// permanencia. Depois, vizinhanca: entrega sem parada propria herda a visita
// de uma irma confirmada DIRETAMENTE a <= 800m (sem encadear), marcada
// viaVizinhanca pra sair diferente no relatorio.

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000
  const p1 = (lat1 * Math.PI) / 180
  const p2 = (lat2 * Math.PI) / 180
  const dp = ((lat2 - lat1) * Math.PI) / 180
  const dl = ((lng2 - lng1) * Math.PI) / 180
  const x = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

export function montarVisitasInclusivas(linhas: LinhaGeocodificada[], paradas: UnitracParadaRow[]): Map<string, Visita> {
  const visitas = new Map<string, Visita>()
  const comCoord = linhas.filter((l): l is LinhaGeocodificada & { lat: number; lng: number } => l.lat != null && l.lng != null)
  const foraBase = paradas.filter((p): p is UnitracParadaRow & { lat: number; lng: number } =>
    p.classificacao === 'FORA_BASE' && p.lat != null && p.lng != null)

  // 1) direto: cada entrega pega a parada de maior permanencia dentro do raio.
  //    Duas faixas -- ate' RAIO_ENTREGA_METROS e' confirmacao normal; entre
  //    ele e RAIO_CONFIRMACAO_AMPLIADO_METROS confirma MARCADA (achado 05/09:
  //    romaneio sem numero, entregas com geocode certo ficavam pendentes por
  //    47m e 107m alem do raio). A faixa de dentro sempre ganha da de fora,
  //    mesmo que a de fora tenha permanencia maior.
  for (const linha of comCoord) {
    let melhor: { parada: UnitracParadaRow; dist: number; dur: number; ampliado: boolean } | null = null
    for (const parada of foraBase) {
      const dist = haversine(parada.lat, parada.lng, linha.lat, linha.lng)
      if (dist > RAIO_CONFIRMACAO_AMPLIADO_METROS) continue
      const ampliado = dist > RAIO_ENTREGA_METROS
      const fim = parada.fim_real ?? parada.saida ?? parada.chegada
      const dur = new Date(fim).getTime() - new Date(parada.chegada).getTime()
      const ganha = !melhor
        || (melhor.ampliado && !ampliado)
        || (melhor.ampliado === ampliado && dur > melhor.dur)
      if (ganha) melhor = { parada, dist, dur, ampliado }
    }
    if (!melhor) continue
    visitas.set(linha.nf, {
      nf: linha.nf,
      chegada: melhor.parada.chegada,
      saida: melhor.parada.fim_real ?? melhor.parada.saida ?? melhor.parada.chegada,
      distanciaMetrosDoPonto: melhor.dist,
      viaVizinhanca: false,
      viaRaioAmpliado: melhor.ampliado,
    })
  }

  // 2) vizinhanca: so' irmas confirmadas DIRETAMENTE emprestam (sem encadear)
  const diretas = comCoord.filter(l => visitas.has(l.nf))
  for (const linha of comCoord) {
    if (visitas.has(linha.nf)) continue
    let melhor: { irma: LinhaGeocodificada & { lat: number; lng: number }; dist: number } | null = null
    for (const irma of diretas) {
      const dist = haversine(irma.lat, irma.lng, linha.lat, linha.lng)
      if (dist > RAIO_VIZINHANCA_METROS) continue
      if (!melhor || dist < melhor.dist) melhor = { irma, dist }
    }
    if (!melhor) continue
    const v = visitas.get(melhor.irma.nf)!
    visitas.set(linha.nf, { nf: linha.nf, chegada: v.chegada, saida: v.saida, distanciaMetrosDoPonto: melhor.dist, viaVizinhanca: true, viaRaioAmpliado: false })
  }
  return visitas
}
