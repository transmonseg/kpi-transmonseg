import type { AvisoDescasamento, LinhaEscala } from './types'

/** Uma carga do lado do Romaneio, so' com o que basta pra cruzar com a
 *  Escala por carga+placa -- evita acoplar esta funcao ao tipo completo de
 *  LinhaGeocodificada (o chamador ja agrupa por essa chave em route.ts). */
export type CargaRomaneio = { carga: string; placaNorm: string }

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

  return avisos.sort((a, b) => a.carga.localeCompare(b.carga) || a.placa.localeCompare(b.placa))
}
