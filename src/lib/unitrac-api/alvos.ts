import { apiPost } from './client'
import { normPlaca } from './frota'

export type AlvoApi = {
  placaNorm: string
  /** pontoidentificador = codigo_unitrac da loja */
  codigoUnitrac: string
  nome: string
  /** 0=pendente, 1=feito, 98=outro */
  situacao: number
  /** hora de conclusão (BRT mascarado como local); null quando não realizado (0001). */
  feitoISO: string | null
  /** documento = nota fiscal */
  documento: string | null
}

type AlvoRaw = {
  placa?: string
  pontoidentificador?: string | number
  pontonome?: string
  alvosituacaoservico?: string | number
  alvodatarealizado?: string
  alvodocumento?: string | number
}

/** Converte a resposta crua de /mapa_servicos/alvos em AlvoApi[]. Pura. */
export function parseAlvos(raw: unknown): AlvoApi[] {
  const lista = (raw as { alvos?: AlvoRaw[] } | null)?.alvos
  if (!Array.isArray(lista)) return []
  return lista.map((a) => {
    const dt = String(a.alvodatarealizado ?? '')
    // "0001-01-01..." (ou vazio) = não realizado → null
    const feitoISO = dt && !dt.startsWith('0001') ? dt : null
    return {
      placaNorm: normPlaca(String(a.placa ?? '')),
      codigoUnitrac: String(a.pontoidentificador ?? ''),
      nome: String(a.pontonome ?? ''),
      situacao: Number(a.alvosituacaoservico ?? 0),
      feitoISO,
      documento: a.alvodocumento != null && String(a.alvodocumento).trim() ? String(a.alvodocumento) : null,
    }
  })
}

/** Busca os alvos (plano de entregas) das placas — best-effort, nunca lança. */
export async function buscarAlvos(cvs: string[]): Promise<AlvoApi[]> {
  return parseAlvos(await apiPost('/mapa_servicos/alvos', cvs))
}

export type ConfirmacaoAlvo = { feitoISO: string; notas: string[] }

/**
 * Confirmação autoritativa por ALVO: a própria Unitrac marcou a entrega como
 * FEITA (situacao=1) com hora de conclusão real. Retorna a hora + todas as notas
 * fiscais dessa loja, ou null. POSITIVO-SÓ: situacao=0 NÃO significa "não foi"
 * (pode ser entrega real não-marcada — caso LKR-5990 Méier), por isso só
 * confiamos no `1`.
 */
export function confirmaPorAlvo(
  placaNorm: string,
  codigoUnitrac: string,
  alvos: AlvoApi[],
): ConfirmacaoAlvo | null {
  const feitos = alvos.filter(
    (a) => a.placaNorm === placaNorm && a.codigoUnitrac === codigoUnitrac && a.situacao === 1 && a.feitoISO,
  )
  if (feitos.length === 0) return null
  const notas = [...new Set(feitos.map((a) => a.documento).filter((d): d is string => !!d))]
  return { feitoISO: feitos[0].feitoISO!, notas }
}
