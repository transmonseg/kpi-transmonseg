// Pura, sem I/O -- usada pelo parse do romaneio e pela chave do cache de geocode.
// Regressao 01/10/2026: o Romaneio de Entrega da Nutry Max passou a trazer o
// CEP no fim do endereco ("... - ** - 28300000", "... - LOJA C - 28180-000",
// "... - B - 2895-0000"). A chave do cache era o texto bruto: cada endereco
// virou linha nova (1.883 em 01/10) e 218 perderam a coordenada ja' aprendida
// (60 curadas a mao). A chave agora e' o endereco SEM o sufixo de CEP (8
// digitos, "5-3" ou "4-4", depois de " - " ou ","), igual ao formato de ate'
// 30/09 -- endereco sem CEP fica identico. So' corta se ainda sobrar
// "rua - bairro..." (nunca reduz o endereco a so' a rua).
const CEP_SUFIXO_RE = /\s*[-,]\s*(\d{5}-?\d{3}|\d{4}-\d{4})\s*$/

export function separarCep(endereco: string): { chave: string; cep: string | null } {
  const m = endereco.match(CEP_SUFIXO_RE)
  if (!m || m.index === undefined) return { chave: endereco, cep: null }
  const chave = endereco.slice(0, m.index).trimEnd()
  if (!chave.includes(' - ')) return { chave: endereco, cep: null }
  return { chave, cep: m[1] }
}

/** Chave de kpi_romaneio_geocode_cache / kpi_romaneio_geocode_negativo. */
export function chaveCacheEndereco(endereco: string): string {
  return separarCep(endereco).chave
}

/** Item 5.2 (colapso de via longa): enderecos DIFERENTES geocodificados pro
 *  MESMO ponto exato. "Diferente" compara a chave do cache (sem o sufixo de
 *  CEP, ver endereco-cep.ts): o mesmo endereco com e sem CEP recebe a mesma
 *  coordenada da mesma linha do cache e nao e' colapso (regressao 01/10).
 *  Devolve os enderecos BRUTOS colididos (todas as variantes). */
export function enderecosColididosPorCoordenada(geoPorEndereco: Map<string, { lat: number; lng: number } | null>): Set<string> {
  const porCoord = new Map<string, { chaves: Set<string>; brutos: string[] }>()
  for (const [endereco, g] of geoPorEndereco) {
    if (!g) continue
    const k = `${g.lat},${g.lng}`
    const grupo = porCoord.get(k) ?? { chaves: new Set<string>(), brutos: [] }
    grupo.chaves.add(chaveCacheEndereco(endereco))
    grupo.brutos.push(endereco)
    porCoord.set(k, grupo)
  }
  const colididos = new Set<string>()
  for (const { chaves, brutos } of porCoord.values()) {
    if (chaves.size > 1) for (const e of brutos) colididos.add(e)
  }
  return colididos
}
