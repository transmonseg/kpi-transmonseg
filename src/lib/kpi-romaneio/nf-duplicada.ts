import type { LinhaGeocodificada } from './types'

// Achado Minor #9 da revisao final do plano do pao (15/09): NF do
// romaneio do pao pode coincidir com NF do romaneio principal na MESMA
// placa (nada impede por construcao, so' o formato tipico de 6 vs 7
// digitos torna raro) -- montarVisitas roda por placa e atribuiria a
// visita de uma a outra silenciosamente. Converte em log visivel em vez
// de deixar silencioso; nao muda nenhum comportamento do caminho normal.
export function logarNfDuplicadaNaMesmaPlaca(linhasPorPlaca: Map<string, LinhaGeocodificada[]>): void {
  for (const [placaNorm, linhasDaPlaca] of linhasPorPlaca) {
    // Achado Minor #2 da revisão final de branch (17/09): placa vazia
    // (carga do pão sem CARRO no documento) nunca passa por montarVisitas
    // (ver placasNorm em route.ts) -- colisão de NF nesse grupo não pode
    // misatribuir visita nenhuma, então logar aqui seria só ruído alarmante.
    if (placaNorm.trim() === '') continue
    const nfsVistos = new Set<string>()
    for (const l of linhasDaPlaca) {
      if (nfsVistos.has(l.nf)) {
        console.error(`[kpi-nutrimax] NF duplicada na mesma placa ${placaNorm}: ${l.nf} -- romaneio principal e pão colidindo? Visita pode ficar atribuída à carga errada.`)
      }
      nfsVistos.add(l.nf)
    }
  }
}
