const OBS_MAP: Record<string, string> = {
  'ANOM-01': '⚠ placa sem GPS',
  'ANOM-02': '⚠ GPS sem escala',
  'ANOM-03': '⚠ parada fora geofence ≥10min',
  'ANOM-04': '⚠ saída < chegada',
  'ANOM-05': '⚠ qtd paradas ≠ escala',
  'ANOM-06': '⚠ saída CD ausente',
  'ANOM-07': '⚠ chegada antes da saída CD',
  'ANOM-08': '⚠ tempo loja >4h',
  'ANOM-10': '⚠ loja não cadastrada',
  'ANOM-11': '⚠ fora janela operacional',
  'ANOM-12': '⚠ parada sem saída registrada',
  'ANOM-13': '⚠ entrega longe da loja (>2km)',
  'ANOM-14': '⚠ placa em 2 lugares ao mesmo tempo',
  'ANOM-15': '⚠ placa errada no Unitrac (typo)',
  'ANOM-16': '⚠ rastro suspeito (ponto isolado/madrugada)',
  'ANOM-17': '⚠ saída-falsa perto de loja',
}

export const ANOMALIAS_HIGH = new Set(['ANOM-01', 'ANOM-04', 'ANOM-06', 'ANOM-07', 'ANOM-14', 'ANOM-15'])

export function codigoToObsText(codigo: string): string {
  return OBS_MAP[codigo] ?? `⚠ anomalia ${codigo}`
}

export function joinObsTexts(codigos: string[]): string {
  if (!codigos?.length) return ''
  return [...new Set(codigos)].map(codigoToObsText).join(' · ')
}

export function temAnomaliaHigh(codigos: string[]): boolean {
  return (codigos ?? []).some(c => ANOMALIAS_HIGH.has(c))
}
