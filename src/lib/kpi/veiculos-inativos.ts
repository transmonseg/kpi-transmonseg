/**
 * Placas crônicas que ficam só em BASE BENASSI nos 5 dias analisados (18-22/05/2026).
 *
 * Esses veículos são apoio/manutenção/folga — não cumprem escala de campo.
 * O matcher V2.1 deve descartá-los logo no início da pipeline.
 *
 * Ver `docs/correcao-sistema/ANALISE-COMPLETA-1039-PLACAS.md` (Padrão A).
 */
export const VEICULOS_INATIVOS: ReadonlySet<string> = new Set([
  'ALS-4H33',
  'AMI-1562',
  'AMR-9986',
  'AMW-4D50',
  'DDI-6J90',
  'DJB-6D42',
  'EOF-4331',
  'EOF-4951',
  'EVU-7F71',
  'EZU-9325',
  'EZU-9D26',
  'EZU-9D27',
  'EZU-9J51',
  'FTV-6F42',
  'GAR-0802',
  'GBC-6E12',
  'GBG-5C11',
  'GEB-9H31',
  'KPT-5B20',
  'LQD-9H59',
  'LRA-9C40',
  'LRA-9C41',
  'PVA-1H61',
  'QSO-8D04',
  'SFG-2F72',
  'SFG-2F73',
  'UBF-5G32',
  'UBF-5G33',
  'UBF-5G36',
  'UBG-7F79',
  'UFL-5C85',
])

function normalizarPlaca(p: string): string {
  return p.toUpperCase().replace(/[^A-Z0-9-]/g, '')
}

export function isVeiculoInativo(placa: string | null | undefined): boolean {
  if (!placa) return false
  return VEICULOS_INATIVOS.has(normalizarPlaca(placa))
}
