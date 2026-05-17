import { forwardRef } from 'react'
import { cn } from './cn'

type Variant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'outline'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: Variant
}

const VARIANTS: Record<Variant, string> = {
  default:
    'bg-[var(--color-bg-subtle)] text-[var(--color-fg-muted)] border border-[var(--color-border)]',
  outline:
    'bg-transparent text-[var(--color-fg-muted)] border border-[var(--color-border-strong)]',
  success:
    'bg-[var(--color-success-soft)] text-[var(--color-success-soft-fg)] border border-[var(--color-success)]/20',
  warning:
    'bg-[var(--color-warning-soft)] text-[var(--color-warning-soft-fg)] border border-[var(--color-warning)]/20',
  danger:
    'bg-[var(--color-danger-soft)] text-[var(--color-danger-soft-fg)] border border-[var(--color-danger)]/20',
  info:
    'bg-[var(--color-info-soft)] text-[var(--color-info-soft-fg)] border border-[var(--color-info)]/20',
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { className, variant = 'default', ...props },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn(
        // Skill: pill shape, micro uppercase tracking 0.05em pra parecer editorial
        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium uppercase leading-4 tracking-[0.05em]',
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  )
})
