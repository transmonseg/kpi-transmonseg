// Ordem canônica de lojas por rede, baseada em KPI PRINCESA.xlsx
// e nas escalas observadas. Sistema usa essa ordem na aba MATRIZ.
// Lojas novas detectadas no dia são adicionadas ao final.

export const MATRIZ_LOJAS: Record<string, string[]> = {
  PRINCESA: [
    'Princesa - Catete', 'Princesa - Flamengo', 'Princesa - Cosme Velho',
    'Princesa - Laranjeiras', 'Princesa - Copacabana', 'Princesa - Leme',
    'Princesa - Pechincha', 'Princesa - Niteroí Barcas', 'Princesa - Inga',
    'Princesa - Fonseca', 'Princesa - Icaraí',
    'Princesa - Iguaba (1ª Entrega)', 'Princesa - Itaboraí (2ª Entrega)',
    'Princesa - Maricá 1 (2ª Entrega)', 'Princesa - Maricá 2 (1ª Entrega)',
    'Princesa - Barra de São João (1ª Entrega)', 'Princesa - Rio das Ostras (2ª Entrega)',
    'Princesa - Arraial 1 (1ª Entrega)', 'Princesa - Arraial 2 (2ª Entrega)', 'Princesa - Arraial 3 (3ª Entrega)',
    'Princesa - Buzios 1 (2ª Entrega)', 'Princesa - Buzios 2 (3ª Entrega)', 'Princesa - Buzios 3 (1ª Entrega)',
    'Princesa - Cabo Frio 1 (1ª Entrega)', 'Princesa - Cabo Frio 2 (3ª Entrega)',
  ],
  PREZUNIC: [
    'Prezunic - Barra da Tijuca', 'Prezunic - Jardim Oceanico', 'Prezunic - Barra Marapendi',
    'Prezunic - Botafogo/Serra Azul', 'Prezunic - Botafogo Voluntários',
    'Prezunic - Ilha do Governador', 'Prezunic - Pechincha', 'Prezunic - Freguesia',
    'Prezunic - Anil (Jacarepaguá)', 'Prezunic - Taquara', 'Prezunic - Tanque',
    'Prezunic - Campinho', 'Prezunic - Cascadura', 'Prezunic - Madureira',
    'Prezunic - Méier', 'Prezunic - Engenho de Dentro', 'Prezunic - Cachambi',
    'Prezunic - Vila Isabel', 'Prezunic - Tijuca', 'Prezunic - Maracanã',
    'Prezunic - Praça da Bandeira', 'Prezunic - Cidade Nova', 'Prezunic - Centro',
    'Prezunic - Lapa', 'Prezunic - Catete', 'Prezunic - Flamengo',
    'Prezunic - Botafogo Praia', 'Prezunic - Humaitá', 'Prezunic - Leblon',
    'Prezunic - Ipanema', 'Prezunic - Copacabana', 'Prezunic - Leme',
    'Prezunic - Penha', 'Prezunic - Olaria', 'Prezunic - Bonsucesso',
    'Prezunic - Vista Alegre', 'Prezunic - Depósito Central',
    'Prezunic SPID - Tijuca', 'Prezunic SPID - Vila Isabel', 'Prezunic SPID - Méier',
    'Prezunic SPID - Madureira', 'Prezunic SPID - Cascadura', 'Prezunic SPID - Pechincha',
    'Prezunic SPID - Freguesia', 'Prezunic SPID - Taquara', 'Prezunic SPID - Botafogo',
    'Prezunic SPID - Copacabana', 'Prezunic SPID - Leblon', 'Prezunic SPID - Ipanema',
  ],
}

// Aliases por rede: nomes alternativos usados nas escalas que mapeiam pro nome canônico do catálogo.
const LOJA_ALIASES_BRUTOS: Record<string, Record<string, string>> = {
  PRINCESA: {
    'princesa - arraial 1': 'Princesa - Arraial 1 (1ª Entrega)',
    'princesa - arraial 2': 'Princesa - Arraial 2 (2ª Entrega)',
    'princesa - arraial 3': 'Princesa - Arraial 3 (3ª Entrega)',
    'princesa - arraial do cabo 1': 'Princesa - Arraial 1 (1ª Entrega)',
    'princesa - arraial do cabo 2': 'Princesa - Arraial 2 (2ª Entrega)',
    'princesa - arraial do cabo 3': 'Princesa - Arraial 3 (3ª Entrega)',
    'princesa - iguaba': 'Princesa - Iguaba (1ª Entrega)',
    'princesa - iguaba grande': 'Princesa - Iguaba (1ª Entrega)',
    'princesa - buzios 1': 'Princesa - Buzios 1 (2ª Entrega)',
    'princesa - buzios 2': 'Princesa - Buzios 2 (3ª Entrega)',
    'princesa - buzios 3': 'Princesa - Buzios 3 (1ª Entrega)',
    'princesa - niterói barcas': 'Princesa - Niteroí Barcas',
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
