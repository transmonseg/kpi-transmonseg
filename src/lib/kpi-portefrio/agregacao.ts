import type { LinhaGeocodificada, LinhaKpiPortefrio, Visita } from './types'

// Recebe so os campos que efetivamente le -- assim serve tanto pra
// LinhaGeocodificada (usado em agregarPorCliente) quanto pra
// LinhaRomaneioPortefrio, o tipo pre-geocodificacao ainda sem lat/lng
// (usado em route.ts pra chave do cache de geocoding). Ambos os tipos
// tem esses 5 campos; so o subconjunto evita que o parametro exija lat/lng.
type ComEndereco = Pick<LinhaGeocodificada, 'endereco' | 'numero' | 'bairro' | 'cidade' | 'uf'>

export function enderecoCompleto(l: ComEndereco): string {
  return `${l.endereco}, ${l.numero} - ${l.bairro}, ${l.cidade} - ${l.uf}`
}

/** Uma linha do romaneio ja vira uma linha do KPI (nao ha agrupamento
 *  por carga como na Nutry Max -- cada cliente e sua propria unidade). */
export function agregarPorCliente(
  linha: LinhaGeocodificada,
  visita: Visita | undefined,
  ordemReal: number | null,
): LinhaKpiPortefrio {
  const temperaturas = visita?.temperaturas ?? []
  const temMedia = temperaturas.length > 0
    ? temperaturas.reduce((s, t) => s + t, 0) / temperaturas.length
    : null

  return {
    placa: linha.placa,
    ordemPlanejada: linha.ordem,
    ordemReal,
    cliente: linha.nomeInformal || linha.razaoSocial,
    endereco: enderecoCompleto(linha),
    visitado: visita !== undefined,
    horarioChegada: visita?.chegada ?? null,
    tempMin: temperaturas.length > 0 ? Math.min(...temperaturas) : null,
    tempMax: temperaturas.length > 0 ? Math.max(...temperaturas) : null,
    tempMedia: temMedia,
  }
}
