import type { LinhaEscala } from '@/lib/types/escala'
import { parseEscalaZonaSul } from './escala-zona-sul'
import { parseEscalaArmazemGrao } from './escala-armazem-grao'
import { parseEscalaPax } from './escala-pax'
import { parseEscalaGeral } from './escala-geral'
import { parseEscalaUniversal } from './escala-universal'

/** Mínimo de linhas pra considerar que um parser reconheceu o arquivo. */
const MIN_LINHAS = 3

/** Conta linhas úteis pro matcher (placa preenchida — chave de junção). */
const contaValidas = (r: LinhaEscala[]): number => r.filter(l => l.placa_norm).length

/**
 * Parseia UM arquivo de escala auto-detectando o formato — mesmo dispatch que a
 * geração de KPI usa. `.pdf` → Guanabara PDF; senão tenta os formatos ESPECÍFICOS
 * (ZonaSul, ArmazémGrão, PAX, Geral) e fica com o que reconhecer MAIS linhas úteis
 * (placa preenchida) — não o primeiro que só bater o mínimo. Dois formatos
 * específicos podem "reconhecer" o mesmo arquivo por coincidência de layout
 * (colunas deslocadas), cada um com uma fração das linhas reais; ficar com o
 * primeiro que passasse de ~3 linhas bloqueava o formato CERTO de rodar. Caso
 * real: arquivo "ESCALA GERAL" caía no parser PAX (18-919 linhas, muitas com
 * placa vazia ou rede/ano errados) antes do parser Geral (152-4059 linhas
 * corretas) ter chance — toda a escala do dia sumia do KPI sem erro visível.
 * Universal só entra se NENHUM formato específico bateu o mínimo (é o fallback
 * genérico, mais solto — não compete por "mais linhas" com os específicos, senão
 * vence por engolir tabs/redes que os específicos corretamente ignoram).
 * Extraído pra ser reusado tanto na geração quanto na análise de alteração (que
 * precisa ler a escala da sessão pra inferir quem sai). Não lança: arquivo não
 * reconhecido retorna [].
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
    const especificos = [
      () => parseEscalaZonaSul(buffer, data),
      () => parseEscalaArmazemGrao(buffer, data),
      () => parseEscalaPax(buffer, data),
      () => parseEscalaGeral(buffer, data),
    ]
    let melhor: LinhaEscala[] | null = null
    let melhorCount = 0
    for (const fn of especificos) {
      try {
        const r = await fn()
        const count = contaValidas(r)
        if (count >= MIN_LINHAS && count > melhorCount) { melhor = r; melhorCount = count }
      } catch (e) {
        // Não interrompe a busca pelo formato certo (é esperado um parser
        // específico rejeitar um arquivo que não é o dele), mas fica logado —
        // sem isso, um parser que quebra por bug real (não por "não é meu
        // formato") falha do mesmo jeito silencioso que o caso real do
        // comentário acima (linhas 18-24: escala sumia sem erro visível).
        console.warn(`[escala-arquivo] parser específico falhou em "${filename}":`, e instanceof Error ? e.message : e)
      }
    }
    if (melhor) return melhor

    // Nenhum formato específico reconheceu o arquivo — fallback genérico
    // (aceita escalas pequenas/simples: rede única, piloto "REDE/FILIAL", sem cor).
    try {
      const r = await parseEscalaUniversal(buffer, data)
      if (contaValidas(r) >= 1) return r
      console.warn(`[escala-arquivo] "${filename}": nenhum formato específico nem o universal reconheceram (0 linhas válidas).`)
    } catch (e) {
      console.warn(`[escala-arquivo] parser universal falhou em "${filename}":`, e instanceof Error ? e.message : e)
    }
  } catch (e) {
    console.warn(`[escala-arquivo] falha inesperada lendo "${filename}":`, e instanceof Error ? e.message : e)
  }
  return []
}
