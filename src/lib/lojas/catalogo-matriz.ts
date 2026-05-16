// Ordem canônica de lojas por rede, baseada em KPI PRINCESA.xlsx
// e nas escalas observadas. Sistema usa essa ordem na aba MATRIZ.
// Lojas novas detectadas no dia são adicionadas ao final.

export const MATRIZ_LOJAS: Record<string, string[]> = {
  PRINCESA: [
    'Princesa - Catete', 'Princesa - Flamengo', 'Princesa - Cosme Velho',
    'Princesa - Laranjeiras', 'Princesa - Copacabana', 'Princesa - Leme',
    'Princesa - Pechincha', 'Princesa - Niterói Barcas', 'Princesa - Inga',
    'Princesa - Fonseca', 'Princesa - Icaraí',
    'Princesa - Iguaba Grande (1ª)', 'Princesa - Itaboraí (2ª)',
    'Princesa - Maricá 1 (2ª)', 'Princesa - Maricá 2 (1ª)',
    'Princesa - Barra de São João (1ª)', 'Princesa - Rio das Ostras (2ª)',
    'Princesa - Arraial do Cabo 1 (1ª)', 'Princesa - Arraial do Cabo 2 (2ª)', 'Princesa - Arraial do Cabo 3 (3ª)',
    'Princesa - Búzios 1 (2ª)', 'Princesa - Búzios 2 (3ª)', 'Princesa - Búzios 3 (1ª)',
    'Princesa - Cabo Frio 1 (1ª)', 'Princesa - Cabo Frio 2 (3ª)', 'Princesa - Cabo Frio 3 (2ª)',
  ],
}

export function getMatrizLojas(rede_id: string, lojasDescobertasNoDia: string[]): string[] {
  const fixo = MATRIZ_LOJAS[rede_id]
  if (fixo) {
    const novas = lojasDescobertasNoDia.filter(l => !fixo.includes(l))
    return [...fixo, ...novas]
  }
  return [...new Set(lojasDescobertasNoDia)].sort()
}

export function detectarMaxLojasPorRota(
  linhas: Array<{ chd_loja_1?: Date | null; chd_loja_2?: Date | null; chd_loja_3?: Date | null }>,
): 1 | 2 | 3 {
  let max: 1 | 2 | 3 = 1
  for (const l of linhas) {
    if (l.chd_loja_3) return 3
    if (l.chd_loja_2 && max < 2) max = 2
  }
  return max
}
