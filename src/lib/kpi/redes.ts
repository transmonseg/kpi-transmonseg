// Redes conhecidas do sistema (ordem de exibição no dashboard).
// Assaí e Sendas são GRUPOS DE ROTA SEPARADOS na operação: ASSAI = hipermercados
// (no Unitrac aparecem como "SENDAS X LJ N", mas estão cadastrados na rede ASSAI);
// SENDAS = mercadinhos de proximidade (Americanas, Mercearia, Petit, Barra Tower…).
export const REDES = [
  'PRINCESA', 'PREZUNIC', 'ZONA_SUL', 'ASSAI', 'SENDAS', 'CARREFOUR',
  'SUPERPRIX', 'GUANABARA', 'SUPER_PAX', 'FEIRA_NOVA', 'EMANUEL',
  'ARMAZEM_GRAO', 'ATACADAO', 'VIANENSE', 'SAMS_CLUB', 'MUNDIAL',
  'SUPERCOMPRAS', 'CAB_PETROPOLIS',
] as const

export const REDE_LABEL: Record<string, string> = {
  PRINCESA: 'Princesa', PREZUNIC: 'Prezunic', ZONA_SUL: 'Zona Sul', ASSAI: 'Assaí',
  SENDAS: 'Sendas', CARREFOUR: 'Carrefour', SUPERPRIX: 'Super Prix', GUANABARA: 'Guanabara',
  SUPER_PAX: 'Super Pax', FEIRA_NOVA: 'Feira Nova', EMANUEL: 'Emanuel', ARMAZEM_GRAO: 'Armazém do Grão',
  ATACADAO: 'Atacadão', VIANENSE: 'Vianense', SAMS_CLUB: "Sam's Club", MUNDIAL: 'Mundial',
  SUPERCOMPRAS: 'Supercompras', CAB_PETROPOLIS: 'CAB Petrópolis',
}

// Aliases de filtro (rede → redes incluídas). Vazio: Assaí e Sendas agora são
// cadastros separados e corretos, não precisam mais ser agrupados na marra.
export const REDE_ALIASES: Record<string, string[]> = {}
