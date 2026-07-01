import type { LinhaEscala } from '@/lib/types/escala'
import { parseEscalaZonaSul } from './escala-zona-sul'
import { parseEscalaArmazemGrao } from './escala-armazem-grao'
import { parseEscalaPax } from './escala-pax'
import { parseEscalaGeral } from './escala-geral'
import { parseEscalaUniversal } from './escala-universal'

/** Mínimo de linhas pra considerar que um parser reconheceu o arquivo. */
const MIN_LINHAS = 3

/**
 * Parseia UM arquivo de escala auto-detectando o formato — mesmo dispatch que a
 * geração de KPI usa. `.pdf` → Guanabara PDF; senão tenta ZonaSul → ArmazémGrão →
 * PAX → Geral (a 1ª que retorna ≥3 linhas vence). Extraído pra ser reusado tanto
 * na geração quanto na análise de alteração (que precisa ler a escala da sessão
 * pra inferir quem sai). Não lança: arquivo não reconhecido retorna [].
 */
export async function parseEscalaArquivo(
  buffer: ArrayBuffer | Buffer,
  filename: string,
  data?: string,
): Promise<LinhaEscala[]> {
  try {
    if (filename.toLowerCase().endsWith('.pdf')) {
      const { parseEscalaGuanabaraPdf } = await import('./escala-guanabara-pdf')
      const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
      return await parseEscalaGuanabaraPdf(buf, data)
    }
    // Universal por último com min=1: só roda quando todos os parsers
    // específicos falharam, e aceita escalas pequenas/simples (rede única,
    // piloto "REDE/FILIAL", sem cor, qualquer layout com placa+loja).
    const tentativas: Array<{ fn: () => Promise<LinhaEscala[]>; min: number }> = [
      { fn: () => parseEscalaZonaSul(buffer, data), min: MIN_LINHAS },
      { fn: () => parseEscalaArmazemGrao(buffer, data), min: MIN_LINHAS },
      { fn: () => parseEscalaPax(buffer, data), min: MIN_LINHAS },
      { fn: () => parseEscalaGeral(buffer, data), min: MIN_LINHAS },
      { fn: () => parseEscalaUniversal(buffer, data), min: 1 },
    ]
    for (const { fn, min } of tentativas) {
      try {
        const r = await fn()
        // Exige `min` linhas com PLACA preenchida, não só `min` linhas. Um parser
        // de formato errado pode "reconhecer" o arquivo por coincidência de layout
        // (colunas deslocadas) e devolver dezenas de linhas com placa_norm vazia —
        // inúteis pro matcher (chave de junção é a placa) mas suficientes pra vencer
        // o dispatch e bloquear o parser CERTO de rodar. Caso real: arquivo "ESCALA
        // GERAL" caía no parser PAX (919 linhas, TODAS placa='', rede/ano errados),
        // nunca chegava no parser Geral (4059 linhas corretas) — toda a escala do
        // dia sumia do KPI (SVB-1F74/Loja 294 e outras: 0:00 sem motivo aparente).
        if (r.filter(l => l.placa_norm).length >= min) return r
      } catch { /* tenta o próximo */ }
    }
  } catch { /* arquivo não reconhecido */ }
  return []
}
