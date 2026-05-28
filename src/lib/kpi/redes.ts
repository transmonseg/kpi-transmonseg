// Redes conhecidas do sistema (ordem de exibição no dashboard).
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
