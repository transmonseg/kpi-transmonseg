// F1-13 (ING-07, plano mestre 23/10): a Escala de Rota entrava sem nenhuma
// checagem -- escala vazia (PDF da Porto Frio na caixa de escala: 0 linhas)
// ou de outro dia (17/10 recebeu a de 16/10, 84 cargas 1002xx) substituia a
// do dia e era marcada como enviada. Agora:
// - 0 cargas lidas: recusa;
// - menos da metade das cargas da escala no romaneio do dia: recusa (422),
//   mostrando a data impressa no PDF quando houver.
// A data sozinha nao bloqueia (13/09 foi domingo: escala impressa num dia,
// rodada em outro). Mesma regra e mesma mensagem no Ao vivo e no Gerar KPI.

export type EscalaRecusada = { motivo: 'vazia' } | { motivo: 'nao_casa'; casam: number; total: number }

/** Minimo de cargas da escala que precisam estar no romaneio do dia. Em 14
 *  dias de Ao vivo (05-23/10) a escala certa casou 95-100%; a errada, 0%. */
const FRACAO_MINIMA_CASAM = 0.5

/** null = escala aceita. `romaneio` vazio (nada para comparar) so' confere a vazia. */
export function conferirEscala(escala: { carga: string }[], romaneio: { carga: string }[]): EscalaRecusada | null {
  const cargasEscala = new Set(escala.map(e => String(e.carga ?? '').trim()).filter(Boolean))
  if (cargasEscala.size === 0) return { motivo: 'vazia' }
  const cargasRomaneio = new Set(romaneio.map(r => String(r.carga ?? '').trim()).filter(Boolean))
  if (cargasRomaneio.size === 0) return null
  const casam = [...cargasEscala].filter(c => cargasRomaneio.has(c)).length
  return casam / cargasEscala.size < FRACAO_MINIMA_CASAM ? { motivo: 'nao_casa', casam, total: cargasEscala.size } : null
}

const br = (iso: string) => iso.split('-').reverse().join('/')

export function mensagemEscalaRecusada(r: EscalaRecusada, dataImpressa: string | null): string {
  if (r.motivo === 'vazia') {
    return 'A Escala de Rota enviada não tem nenhuma carga reconhecida — confira se é a "8081 - Escala de Rota" da Nutry Max. Nada foi trocado.'
  }
  const impressa = dataImpressa ? ` (a escala foi impressa em ${br(dataImpressa)})` : ''
  return `A Escala de Rota enviada não bate com o Romaneio do dia: só ${r.casam} de ${r.total} cargas da escala estão no romaneio${impressa}. Confira se subiu a escala do dia certo. Nada foi trocado.`
}

/** Primeira data dd/mm/aaaa do texto do PDF (a 8081 traz "16/10/2026 05:44" no topo). */
export function dataImpressaDoTexto(textos: string[]): string | null {
  for (const t of textos) {
    const m = /\b(\d{2})\/(\d{2})\/(\d{4})\b/.exec(t)
    if (m) return `${m[3]}-${m[2]}-${m[1]}`
  }
  return null
}
