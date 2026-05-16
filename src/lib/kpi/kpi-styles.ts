export const KPI_COLORS = {
  TRANSMONSEG_YELLOW: 'FFFFD700',
  BRAND_BLUE: 'FF1F4E78',
  BRAND_BLUE_LIGHT: 'FF2E75B6',
  HEADER_TEXT: 'FFFFFFFF',
  BG_WHITE: 'FFFFFFFF',
  BG_ZEBRA: 'FFF8FAFC',
  BORDER: 'FFE2E8F0',
  TEXT_DEFAULT: 'FF1E293B',
  TEXT_MUTED: 'FF475569',
  TEXT_SUBTLE: 'FF94A3B8',
  TEMPO_GOOD: 'FFDCFCE7',
  TEMPO_MEDIUM: 'FFFEF3C7',
  TEMPO_HIGH: 'FFFED7AA',
  ANOMALIA_HIGH_BG: 'FFFEF2F2',
} as const

export const KPI_FONTS = {
  TITLE: { name: 'Calibri', size: 18, bold: true, color: { argb: KPI_COLORS.TEXT_DEFAULT } },
  SUBTITLE: { name: 'Calibri', size: 11, italic: true, color: { argb: KPI_COLORS.TEXT_MUTED } },
  HEADER: { name: 'Calibri', size: 11, bold: true, color: { argb: KPI_COLORS.HEADER_TEXT } },
  BODY: { name: 'Calibri', size: 10, color: { argb: KPI_COLORS.TEXT_DEFAULT } },
  BODY_MUTED: { name: 'Calibri', size: 10, italic: true, color: { argb: KPI_COLORS.TEXT_SUBTLE } },
} as const

export const KPI_BORDER_THIN = {
  bottom: { style: 'thin' as const, color: { argb: KPI_COLORS.BORDER } },
}

export const REDE_NOMES_CANONICOS: Record<string, string> = {
  PRINCESA: 'Princesa',
  PREZUNIC: 'Prezunic',
  CARREFOUR: 'Carrefour',
  ASSAI: 'Assaí',
  SUPERPRIX: 'Superprix',
  ATACADAO: 'Atacadão',
  SAMS_CLUB: "Sam's Club",
  VIANENSE: 'Vianense',
  CAB_PETROPOLIS: 'CAB-Petrópolis',
  SENDAS: 'Sendas',
  GUANABARA: 'Guanabara',
  SUPER_PAX: 'Superpax',
  FEIRA_NOVA: 'Feira Nova',
  EMANUEL: 'Rede Emanuel',
  ARMAZEM_GRAO: 'Armazém do Grão',
  ZONA_SUL: 'Zona Sul',
  DESCONHECIDO: 'Outros',
}

export function formataDataPtBr(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const diaSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'][dt.getUTCDay()]
  const mes = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][dt.getUTCMonth()]
  return `${diaSemana}, ${String(d).padStart(2, '0')} de ${mes} de ${y}`
}
