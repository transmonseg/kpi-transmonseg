import { orfasProximasDoPendente, type ParametrosOrfas } from './paradas-orfas'
import type { DumpExperimento } from './tipos'

export type RotuloGabarito = { data: string; nf: string; veredito: 'entregue' | 'sem_evidencia'; fonte: string }

export type AvaliacaoGabarito = {
  raioM: number
  entregueTotal: number
  entregueComOrfa: number
  semEvidenciaTotal: number
  semEvidenciaComOrfa: number
  jaConfirmadas: number
  naoEncontradas: number
}

/** So' avalia rotulo de dia que tem dump. NF ja' confirmada no dump nao entra
 *  na conta (a regra nova so' age em pendente); NF ausente do dump e' contada a parte. */
export function avaliarContraGabarito(
  dumps: DumpExperimento[], gabarito: RotuloGabarito[], p: ParametrosOrfas, raioM: number,
): AvaliacaoGabarito {
  const dumpPorData = new Map(dumps.map(d => [d.data, d]))
  const r = { entregueTotal: 0, entregueComOrfa: 0, semEvidenciaTotal: 0, semEvidenciaComOrfa: 0, jaConfirmadas: 0, naoEncontradas: 0 }
  for (const rotulo of gabarito) {
    const dump = dumpPorData.get(rotulo.data)
    if (!dump) continue
    const linha = dump.linhas.find(l => l.nf === rotulo.nf)
    if (!linha) { r.naoEncontradas++; continue }
    if (linha.status !== 'pendente') { r.jaConfirmadas++; continue }
    const temOrfa = orfasProximasDoPendente(dump, linha, p, raioM).length > 0
    if (rotulo.veredito === 'entregue') { r.entregueTotal++; if (temOrfa) r.entregueComOrfa++ }
    else { r.semEvidenciaTotal++; if (temOrfa) r.semEvidenciaComOrfa++ }
  }
  return { raioM, ...r }
}
