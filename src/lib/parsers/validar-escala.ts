import type { LinhaEscala } from '@/lib/types/escala'

export type ResultadoValidacaoEscala = {
  /** false só em caso DURO (escala vazia) — aí a geração nem deve seguir. */
  ok: boolean
  /** Problemas que merecem atenção do operador, mas NÃO bloqueiam a geração. */
  avisos: string[]
  stats: { total: number; semPlaca: number; redeDesconhecida: number; semLoja: number }
}

// Limiares altos de propósito: escala legítima quase nunca passa deles. Só
// disparam quando a leitura provavelmente errou (ex: coluna trocada → placa/loja
// viram lixo, rede vira DESCONHECIDO em massa).
const LIMIAR_SEM_PLACA = 0.5
const LIMIAR_REDE_DESCONHECIDA = 0.4
const LIMIAR_SEM_LOJA = 0.3

/**
 * Sanidade pós-parse da escala. Roda nas linhas JÁ parseadas (qualquer formato/
 * parser). Não tenta adivinhar o formato — só detecta quando o resultado tem cara
 * de leitura errada e AVISA, pra nunca gerar KPI silenciosamente com placa/loja/
 * rede trocadas. Pura, sem I/O.
 */
export function validarEscala(linhas: LinhaEscala[]): ResultadoValidacaoEscala {
  const total = linhas.length
  if (total === 0) {
    return { ok: false, avisos: ['Nenhuma linha reconhecida na escala — confira se o arquivo é uma escala suportada.'], stats: { total: 0, semPlaca: 0, redeDesconhecida: 0, semLoja: 0 } }
  }
  const semPlaca = linhas.filter(l => !l.placa_norm).length
  const redeDesconhecida = linhas.filter(l => l.rede_id === 'DESCONHECIDO').length
  const semLoja = linhas.filter(l => !l.loja_nome_raw || !String(l.loja_nome_raw).trim()).length

  const avisos: string[] = []
  const pct = (n: number) => Math.round((n / total) * 100)
  if (semPlaca / total >= LIMIAR_SEM_PLACA)
    avisos.push(`${pct(semPlaca)}% das linhas sem placa válida — a coluna de placa pode ter sido lida errada. Confira a escala antes de usar.`)
  if (redeDesconhecida / total >= LIMIAR_REDE_DESCONHECIDA)
    avisos.push(`${pct(redeDesconhecida)}% das linhas com rede não reconhecida — o formato/colunas da escala pode ter mudado. Confira antes de usar.`)
  if (semLoja / total >= LIMIAR_SEM_LOJA)
    avisos.push(`${pct(semLoja)}% das linhas sem nome de loja — a coluna de loja pode ter sido lida errada. Confira antes de usar.`)

  return { ok: true, avisos, stats: { total, semPlaca, redeDesconhecida, semLoja } }
}
