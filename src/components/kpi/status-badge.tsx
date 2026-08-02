const STATUS_STYLE: Record<string, { label: string; bg: string; fg: string }> = {
  entregue: { label: 'Entregue', bg: 'var(--color-success-soft)', fg: 'var(--color-success-soft-fg)' },
  nao_foi: { label: 'Não foi ao cliente', bg: 'var(--color-danger-soft)', fg: 'var(--color-danger-soft-fg)' },
  sem_rastreador: { label: 'Sem rastreador', bg: 'var(--color-danger-soft)', fg: 'var(--color-danger-soft-fg)' },
  em_rota: { label: 'Em rota', bg: 'var(--color-warning-soft)', fg: 'var(--color-warning-soft-fg)' },
  mudou_de_rota: { label: 'Mudou de rota', bg: 'var(--color-warning-soft)', fg: 'var(--color-warning-soft-fg)' },
  desatualizado: { label: 'Desatualizado', bg: 'var(--color-warning-soft)', fg: 'var(--color-warning-soft-fg)' },
  indefinido: { label: 'Indefinido', bg: 'var(--color-bg-subtle)', fg: 'var(--color-fg-muted)' },
}

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? { label: status, bg: 'var(--color-bg-subtle)', fg: 'var(--color-fg-muted)' }
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold whitespace-nowrap"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  )
}
