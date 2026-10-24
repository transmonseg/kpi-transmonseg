// F3-06 (ING-12): coluna DUPLICADO da Escala de Rota 8081 (antes lida como
// "status do rastreador"). Módulo próprio, sem PDF, para quem só lê a escala.
import type { LinhaEscala } from './types'

/** Coluna DUPLICADO da linha da escala, inclusive de escala guardada antes do
 *  F3-06 (campo statusRastreador). */
export function duplicadoDaEscala(e: Pick<LinhaEscala, 'duplicado' | 'statusRastreador'> | null | undefined): string | null {
  return e?.duplicado ?? e?.statusRastreador ?? null
}

/** Placas marcadas "VEICULO" na coluna DUPLICADO (a mesma placa em 2 cargas),
 *  com as cargas em que aparecem. */
export function veiculosEmDuasCargas(escala: Pick<LinhaEscala, 'carga' | 'placaNorm' | 'duplicado' | 'statusRastreador'>[]): { placa: string; cargas: string[] }[] {
  const porPlaca = new Map<string, Set<string>>()
  for (const e of escala) {
    if (!/VEICULO/i.test(duplicadoDaEscala(e) ?? '')) continue
    const s = porPlaca.get(e.placaNorm) ?? new Set<string>()
    s.add(e.carga)
    porPlaca.set(e.placaNorm, s)
  }
  // a outra carga da mesma placa pode não estar marcada: junta todas da escala
  for (const e of escala) porPlaca.get(e.placaNorm)?.add(e.carga)
  return [...porPlaca].map(([placa, c]) => ({ placa, cargas: [...c].sort() })).sort((a, b) => a.placa.localeCompare(b.placa))
}
