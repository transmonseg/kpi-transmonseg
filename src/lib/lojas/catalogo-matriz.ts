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

// Aliases por rede: nomes alternativos usados nas escalas que mapeiam pro nome canônico do catálogo.
// Necessário quando a escala usa nomes ligeiramente diferentes (ex: "Arraial 1" vs "Arraial do Cabo 1").
const LOJA_ALIASES_BRUTOS: Record<string, Record<string, string>> = {
  PRINCESA: {
    'princesa - arraial 1': 'Princesa - Arraial do Cabo 1 (1ª)',
    'princesa - arraial 2': 'Princesa - Arraial do Cabo 2 (2ª)',
    'princesa - arraial 3': 'Princesa - Arraial do Cabo 3 (3ª)',
    'princesa - iguaba': 'Princesa - Iguaba Grande (1ª)',
  },
}

// Normaliza nome de loja para comparação: remove acentos, lowercase, remove "(Xª Entrega)" e "(Xº Entrega)",
// colapsa espaços, remove pontuação dupla.
function normalizaParaMatch(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(\s*\d+\s*[ºoa°ª]\s*entrega\s*\)/gi, '')
    .replace(/\(\s*\d+\s*[ºoa°ª]\s*\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Constrói índice de match por rede: chave normalizada → nome canônico do catálogo
function buildIndice(): Record<string, Map<string, string>> {
  const out: Record<string, Map<string, string>> = {}
  for (const [rede, lojas] of Object.entries(MATRIZ_LOJAS)) {
    const idx = new Map<string, string>()
    for (const canon of lojas) idx.set(normalizaParaMatch(canon), canon)
    // adiciona aliases
    const aliases = LOJA_ALIASES_BRUTOS[rede] ?? {}
    for (const [alias, canon] of Object.entries(aliases)) {
      idx.set(normalizaParaMatch(alias), canon)
    }
    out[rede] = idx
  }
  return out
}

const INDICES = buildIndice()

/**
 * Tenta achar o nome canônico do catálogo para uma loja da escala.
 * Retorna null se não houver match.
 */
export function resolverNomeCanonico(rede_id: string, nomeEscala: string): string | null {
  const idx = INDICES[rede_id]
  if (!idx) return null
  const chave = normalizaParaMatch(nomeEscala)
  return idx.get(chave) ?? null
}

export function getMatrizLojas(rede_id: string, lojasDescobertasNoDia: string[]): string[] {
  const fixo = MATRIZ_LOJAS[rede_id]
  if (fixo) {
    const fixoSet = new Set(fixo)
    const novas = lojasDescobertasNoDia.filter(l => !fixoSet.has(l))
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
