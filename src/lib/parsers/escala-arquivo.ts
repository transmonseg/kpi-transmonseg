import type { LinhaEscala } from '@/lib/types/escala'
import { parseEscalaZonaSul } from './escala-zona-sul'
import { parseEscalaArmazemGrao } from './escala-armazem-grao'
import { parseEscalaPax } from './escala-pax'
import { parseEscalaGeral } from './escala-geral'

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
    const tentativas: Array<() => Promise<LinhaEscala[]>> = [
      () => parseEscalaZonaSul(buffer, data),
      () => parseEscalaArmazemGrao(buffer, data),
      () => parseEscalaPax(buffer, data),
      () => parseEscalaGeral(buffer, data),
    ]
    for (const fn of tentativas) {
      try {
        const r = await fn()
        if (r.length >= MIN_LINHAS) return r
      } catch { /* tenta o próximo */ }
    }
  } catch { /* arquivo não reconhecido */ }
  return []
}
