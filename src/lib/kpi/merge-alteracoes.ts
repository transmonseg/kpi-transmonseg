/**
 * Merge inline alterações (UI/request atual) com alterações persistidas no banco,
 * deduplicando por placa quando disponível ou por motorista+rede como fallback.
 *
 * Sem o fallback de motorista, alterações sem placa (só-motorista) seriam aplicadas
 * duas vezes (uma do inline, outra do banco). O bug original retornava `false` no
 * fallback, forçando duplicação.
 *
 * Comportamento: percorre cada item do banco; se já existe equivalente no inline,
 * é descartado; caso contrário, é anexado ao final. A ordem do inline é preservada.
 */

export type AltSlotEntra = {
  motorista_nome: string | null
  motorista_codigo: number | null
  placa_raw: string | null
  placa_norm: string | null
}

export type AltSlotSai = {
  motorista_nome: string | null
  placa_norm: string | null
}

export type AltEntry = {
  tipo: string
  rede_id: string | null
  loja_raw: string | null
  entra: AltSlotEntra | null
  sai: AltSlotSai | null
}

function norm(s: string | null | undefined): string | undefined {
  return s?.toLowerCase().trim()
}

function isSameAlteracao(a: AltEntry, b: AltEntry): boolean {
  const aEntraPlaca = a.entra?.placa_norm
  const bEntraPlaca = b.entra?.placa_norm
  const aSaiPlaca = a.sai?.placa_norm
  const bSaiPlaca = b.sai?.placa_norm

  // Chave por placa: ambos os lados precisam ter placa entra para usar
  if (aEntraPlaca && bEntraPlaca) {
    return aEntraPlaca === bEntraPlaca && aSaiPlaca === bSaiPlaca
  }

  // Fallback: deduplica por motorista quando não há placa em ambos os lados
  const aEntraMot = norm(a.entra?.motorista_nome)
  const bEntraMot = norm(b.entra?.motorista_nome)
  const aSaiMot = norm(a.sai?.motorista_nome)
  const bSaiMot = norm(b.sai?.motorista_nome)
  if (!aEntraMot || !bEntraMot) return false
  return aEntraMot === bEntraMot && aSaiMot === bSaiMot && a.rede_id === b.rede_id
}

export function mergeAlteracoes<T extends AltEntry>(inline: T[], db: T[]): T[] {
  const result: T[] = [...inline]
  for (const dbAlt of db) {
    const dup = result.some(a => isSameAlteracao(a, dbAlt))
    if (!dup) result.push(dbAlt)
  }
  return result
}
