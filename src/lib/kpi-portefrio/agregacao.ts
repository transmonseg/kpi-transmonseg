import type { LinhaGeocodificada, LinhaKpiPortefrio, Visita } from './types'

function enderecoCompleto(l: LinhaGeocodificada): string {
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
