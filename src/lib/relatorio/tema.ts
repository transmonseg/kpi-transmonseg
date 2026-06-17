import { StyleSheet } from '@react-pdf/renderer'

// Paleta navy KPI (#1F3864) — mesma identidade do dashboard e dos XLSX gerados.
export const C = {
  navy: '#1F3864',
  navySoft: '#E2EAF3',
  ink: '#0A0A0A',
  inkSoft: '#3F3E3A',
  muted: '#6B6660',
  border: '#E1DDD9',
  bg: '#FFFFFF',
  bgSubtle: '#F4F4F3',
  ok: '#16A34A',
  warn: '#D97706',
  bad: '#DC2626',
  info: '#2563EB',
}

export const S = StyleSheet.create({
  page: {
    paddingTop: 44, paddingBottom: 56, paddingHorizontal: 44,
    fontSize: 9.5, color: C.ink, fontFamily: 'Helvetica',
  },
  h1: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: C.navy },
  h2: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.ink, marginBottom: 8 },
  overline: {
    fontSize: 7.5, letterSpacing: 1.2, color: C.muted,
    fontFamily: 'Helvetica-Bold', textTransform: 'uppercase',
  },
  muted: { color: C.muted },
  card: { borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 12 },
  row: { flexDirection: 'row' },
})

export const fmtMin = (n: number | null | undefined) => {
  if (n == null || isNaN(n)) return 's/d'
  const h = Math.floor(n / 60), m = Math.round(n % 60)
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`
}

export const fmtNum = (n: number | null | undefined) =>
  n == null || isNaN(n) ? 's/d' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 })

/** Ordem canônica das 7 categorias no mix de status do relatório. */
export const ORDEM_STATUS = [
  'entregue', 'em_rota', 'nao_foi', 'mudou_de_rota', 'desatualizado', 'sem_rastreador', 'indefinido',
] as const
export type StatusKey = typeof ORDEM_STATUS[number]

export const STATUS_LABEL: Record<StatusKey, string> = {
  entregue: 'Entregue',
  em_rota: 'Em rota',
  nao_foi: 'Não foi',
  mudou_de_rota: 'Mudou de rota',
  desatualizado: 'Desatualizado',
  sem_rastreador: 'Sem rastreador',
  indefinido: 'Em análise',
}

// Cores print-friendly; "em análise" usa um cinza claro distinto de "sem rastreador".
export const STATUS_COR: Record<StatusKey, string> = {
  entregue: C.ok,
  em_rota: C.info,
  nao_foi: C.bad,
  mudou_de_rota: C.warn,
  desatualizado: '#B45309',
  sem_rastreador: C.muted,
  indefinido: '#B8B2AA',
}
