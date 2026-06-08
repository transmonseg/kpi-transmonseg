// Redes conhecidas do sistema (ordem de exibição no dashboard).
// SENDAS não aparece aqui pois no Unitrac o Assaí opera como SENDAS (Grupo GPA) —
// os chips do dashboard mostram só ASSAI, que agrupa os dados das duas.
export const REDES = [
  'PRINCESA', 'PREZUNIC', 'ZONA_SUL', 'ASSAI', 'CARREFOUR',
  'SUPERPRIX', 'GUANABARA', 'SUPER_PAX', 'FEIRA_NOVA', 'EMANUEL',
  'ARMAZEM_GRAO', 'ATACADAO', 'VIANENSE', 'SAMS_CLUB', 'MUNDIAL',
  'SUPERCOMPRAS', 'CAB_PETROPOLIS',
] as const

export const REDE_LABEL: Record<string, string> = {
  PRINCESA: 'Princesa', PREZUNIC: 'Prezunic', ZONA_SUL: 'Zona Sul', ASSAI: 'Assaí',
  SENDAS: 'Assaí', CARREFOUR: 'Carrefour', SUPERPRIX: 'Super Prix', GUANABARA: 'Guanabara',
  SUPER_PAX: 'Super Pax', FEIRA_NOVA: 'Feira Nova', EMANUEL: 'Emanuel', ARMAZEM_GRAO: 'Armazém do Grão',
  ATACADAO: 'Atacadão', VIANENSE: 'Vianense', SAMS_CLUB: "Sam's Club", MUNDIAL: 'Mundial',
  SUPERCOMPRAS: 'Supercompras', CAB_PETROPOLIS: 'CAB Petrópolis',
}

// Quando o usuário filtra por uma rede no dashboard, expande pra incluir aliases
// (ex: filtrar ASSAI também inclui SENDAS, que é o mesmo grupo no Unitrac).
export const REDE_ALIASES: Record<string, string[]> = {
  ASSAI: ['ASSAI', 'SENDAS'],
}
