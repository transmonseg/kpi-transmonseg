import type { AvisoDescasamento, LinhaEscala, LinhaGeocodificada } from './types'
import { haversine } from '@/lib/utils/geo'

/** Uma carga do lado do Romaneio, so' com o que basta pra cruzar com a
 *  Escala por carga+placa -- evita acoplar esta funcao ao tipo completo de
 *  LinhaGeocodificada (o chamador ja agrupa por essa chave em route.ts). */
export type CargaRomaneio = { carga: string; placaNorm: string; nfsRomaneio?: number }

/** Cruza Escala (planejado) com as cargas que de fato apareceram no
 *  Romaneio geocodificado, pela mesma chave carga+placa usada no resto do
 *  pipeline (route.ts), e devolve os descasamentos nos dois sentidos.
 *  Pura -- nao bloqueia nada, so' relata (ver spec: "aviso agregado no
 *  topo do relatorio... nao bloqueia"). */
export function detectarDescasamentos(
  escala: LinhaEscala[],
  cargasRomaneio: CargaRomaneio[],
): AvisoDescasamento[] {
  const chaveRomaneio = new Set(cargasRomaneio.map(c => `${c.carga}::${c.placaNorm}`))
  const chaveEscala = new Set(escala.map(e => `${e.carga}::${e.placaNorm}`))

  const avisos: AvisoDescasamento[] = []

  for (const e of escala) {
    if (!chaveRomaneio.has(`${e.carga}::${e.placaNorm}`)) {
      avisos.push({ carga: e.carga, placa: e.placaNorm, motivo: 'sem_romaneio' })
    }
  }
  for (const c of cargasRomaneio) {
    if (!chaveEscala.has(`${c.carga}::${c.placaNorm}`)) {
      avisos.push({ carga: c.carga, placa: c.placaNorm, motivo: 'sem_escala' })
    }
  }
  // Task 2 (plano 2026-09-30, item 2 -- RQS7H76 29/09: Escala 34 x Romaneio
  // 32): NF PLANEJADO (aba 1) vem da Escala, detalhe e taxa vem do Romaneio.
  // Divergencia de quantidade so' vira aviso -- nunca entra no denominador
  // (as NFs "extras" da Escala nao tem numero, nao da pra auditar).
  const nfsRomaneioPorChave = new Map(cargasRomaneio
    .filter(c => c.nfsRomaneio != null)
    .map(c => [`${c.carga}::${c.placaNorm}`, c.nfsRomaneio as number]))
  for (const e of escala) {
    const nfRomaneio = nfsRomaneioPorChave.get(`${e.carga}::${e.placaNorm}`)
    if (e.nfPlanejado == null || nfRomaneio == null || e.nfPlanejado === nfRomaneio) continue
    avisos.push({ carga: e.carga, placa: e.placaNorm, motivo: 'nf_divergente', nfEscala: e.nfPlanejado, nfRomaneio })
  }

  return avisos.sort((a, b) => a.carga.localeCompare(b.carga) || a.placa.localeCompare(b.placa))
}

/** Alerta operacional (02/10): motorista que aparece em 2+ placas DIFERENTES
 *  no mesmo dia -- sinal de escala trocada ou erro de cadastro. Caso real
 *  30/09: CARLOS SILVA na TUO1D10 e na RBJ2J67. Nao muda taxa nem
 *  confirmacao -- so' informa na aba Avisos pra operacao conferir. */
export function detectarMotoristaMultiplasPlacas(
  escala: LinhaEscala[],
): AvisoDescasamento[] {
  const placasPorMotorista = new Map<string, Set<string>>()
  const nomeOriginal = new Map<string, string>()
  for (const e of escala) {
    if (!e.motorista) continue
    const chave = e.motorista.trim().toUpperCase()
    if (!placasPorMotorista.has(chave)) {
      placasPorMotorista.set(chave, new Set())
      nomeOriginal.set(chave, e.motorista.trim())
    }
    placasPorMotorista.get(chave)!.add(e.placaNorm)
  }
  const avisos: AvisoDescasamento[] = []
  for (const [chave, placas] of placasPorMotorista) {
    if (placas.size < 2) continue
    const lista = [...placas].sort()
    avisos.push({
      carga: '—',
      placa: lista.join(', '),
      motivo: 'motorista_multiplas_placas',
      motorista: nomeOriginal.get(chave),
      placas: lista,
    })
  }
  return avisos.sort((a, b) => (a.motorista ?? '').localeCompare(b.motorista ?? ''))
}

/** Limiar de distancia entre centroides de NFs da MESMA carga pra considerar
 *  "regioes diferentes" (pedido 02/10). 60km cobre o caso real Campos x Rio
 *  (~220km) sem pegar variacao normal dentro de uma mesma regiao metropolitana. */
const DISTANCIA_MIN_MULTIREGIAO_KM = 60

/** Alerta operacional (02/10): carga com NFs espalhadas em regioes distantes
 *  (>60km entre centroides) -- sinal de que a escala juntou entregas que nao
 *  sao da mesma rota. Nao muda taxa -- so' informa. */
export function detectarCargaMultiRegiao(
  linhas: LinhaGeocodificada[],
): AvisoDescasamento[] {
  const porCarga = new Map<string, { lat: number; lng: number }[]>()
  for (const l of linhas) {
    if (l.lat == null || l.lng == null) continue
    const arr = porCarga.get(l.carga)
    if (arr) arr.push({ lat: l.lat, lng: l.lng })
    else porCarga.set(l.carga, [{ lat: l.lat, lng: l.lng }])
  }
  const avisos: AvisoDescasamento[] = []
  for (const [carga, pontos] of porCarga) {
    if (pontos.length < 2) continue
    let maxDist = 0
    for (let i = 0; i < pontos.length; i++) {
      for (let j = i + 1; j < pontos.length; j++) {
        const d = haversine(pontos[i].lat, pontos[i].lng, pontos[j].lat, pontos[j].lng) / 1000
        if (d > maxDist) maxDist = d
      }
    }
    if (maxDist > DISTANCIA_MIN_MULTIREGIAO_KM) {
      avisos.push({
        carga,
        placa: '—',
        motivo: 'carga_multiregiao',
        distanciaKm: Math.round(maxDist),
      })
    }
  }
  return avisos.sort((a, b) => a.carga.localeCompare(b.carga))
}
