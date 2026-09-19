import { orfasProximasDoPendente, type ParametrosOrfas } from './paradas-orfas'
import type { DumpExperimento, LinhaDump } from './tipos'

export type RotuloGabarito = { data: string; nf: string; veredito: 'entregue' | 'sem_evidencia'; fonte: string }

export type AvaliacaoGabarito = {
  raioM: number
  entregueTotal: number
  entregueComOrfa: number
  semEvidenciaTotal: number
  semEvidenciaComOrfa: number
  /** Ja' confirmada no dump e rotulada `entregue` (confirmacao correta do motor atual). */
  jaConfirmadaCorreta: number
  /** Ja' confirmada no dump mas rotulada `sem_evidencia` (falsa confirmacao do motor atual). */
  jaConfirmadaFalsa: number
  naoEncontradas: number
}

/** Casa cada rotulo pela NF em QUALQUER dump; `rotulo.data` e' ignorada porque mistura a data da
 *  entrega com a data em que a Ana postou a analise (varias etiquetas estao no dump do dia anterior).
 *  Confirmadas no dump nao entram na conta da regra nova (so' age em pendente), mas sao separadas em
 *  corretas/falsas; NF ausente de todos os dumps e' contada a parte. */
export function avaliarContraGabarito(
  dumps: DumpExperimento[], gabarito: RotuloGabarito[], p: ParametrosOrfas, raioM: number,
): AvaliacaoGabarito {
  const porNf = new Map<string, { dump: DumpExperimento; linha: LinhaDump }>()
  for (const dump of dumps) for (const linha of dump.linhas) if (!porNf.has(linha.nf)) porNf.set(linha.nf, { dump, linha })
  const r = {
    entregueTotal: 0, entregueComOrfa: 0, semEvidenciaTotal: 0, semEvidenciaComOrfa: 0,
    jaConfirmadaCorreta: 0, jaConfirmadaFalsa: 0, naoEncontradas: 0,
  }
  for (const rotulo of gabarito) {
    const achado = porNf.get(rotulo.nf)
    if (!achado) { r.naoEncontradas++; continue }
    const { dump, linha } = achado
    if (linha.status !== 'pendente') {
      if (rotulo.veredito === 'entregue') r.jaConfirmadaCorreta++; else r.jaConfirmadaFalsa++
      continue
    }
    const temOrfa = orfasProximasDoPendente(dump, linha, p, raioM).length > 0
    if (rotulo.veredito === 'entregue') { r.entregueTotal++; if (temOrfa) r.entregueComOrfa++ }
    else { r.semEvidenciaTotal++; if (temOrfa) r.semEvidenciaComOrfa++ }
  }
  return { raioM, ...r }
}
