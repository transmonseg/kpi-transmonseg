// Modo "sem cadastro Unitrac" (SEM_CADASTRO_UNITRAC=1 no script avulso de
// geracao): mede quanto o KPI depende do cadastro/alvos da Unitrac. Nesse
// modo (1) a ponte NAO recebe latAlt/lngAlt/feitoEm (anexarCoordenadaCadastro
// e' pulada) e (2) os alvos da Unitrac NAO confirmam entrega (agregacao recebe
// lista vazia). As NFs que so' a Unitrac confirmaria sao contadas a parte.
import type { AlvoApi } from '@/lib/unitrac-api'
import type { PontoEntregaBridge } from './base-horarios'

export function semCadastroUnitrac(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.SEM_CADASTRO_UNITRAC
  return v === '1' || v === 'true'
}

/** NFs (situacao=1 na Unitrac) que nenhuma Visita GPS confirmou. */
export function nfsSoUnitrac(alvos: AlvoApi[], visitasPorPlaca: Map<string, Map<string, unknown>>): string[] {
  const out: string[] = []
  for (const a of alvos) {
    if (a.situacao !== 1 || !a.documento) continue
    if (!visitasPorPlaca.get(a.placaNorm)?.has(a.documento)) out.push(a.documento)
  }
  return out
}

export type { PontoEntregaBridge }
