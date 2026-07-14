import type { AvisoCoberturaNutrimax, LinhaEscalaNutrimax, LinhaRomaneioNutrimax } from './types'

/**
 * Cruza o planejado (Escala) com o executado (Romaneio) e devolve avisos —
 * mesma lógica de "avisar em vez de esconder falha parcial" já usada no
 * gerador do Benassi (redes_com_erro).
 */
export function checarCobertura(
  escala: LinhaEscalaNutrimax[],
  romaneio: LinhaRomaneioNutrimax[],
): AvisoCoberturaNutrimax[] {
  const porCarga = new Map<string, LinhaRomaneioNutrimax[]>()
  for (const l of romaneio) {
    const arr = porCarga.get(l.carga) ?? []
    arr.push(l)
    porCarga.set(l.carga, arr)
  }

  const avisos: AvisoCoberturaNutrimax[] = []

  for (const e of escala) {
    const linhas = porCarga.get(e.carga)
    if (!linhas || linhas.length === 0) {
      avisos.push({ tipo: 'carga_ausente', carga: e.carga, destino: e.destino, placa: e.placaNorm })
      continue
    }

    const placaRomaneio = linhas[0].placa
    if (e.placaNorm && placaRomaneio && e.placaNorm !== placaRomaneio) {
      avisos.push({ tipo: 'placa_divergente', carga: e.carga, placaEscala: e.placaNorm, placaRomaneio })
    }

    if (e.nfPlanejado != null && linhas.length < e.nfPlanejado) {
      avisos.push({ tipo: 'entregas_incompletas', carga: e.carga, planejado: e.nfPlanejado, recebido: linhas.length })
    }
  }

  return avisos
}
