import { forwardRef } from 'react'
import { cn } from './cn'

type Variant = 'default' | 'success' | 'warning' | 'danger' | 'info'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: Variant
}

const VARIANTS: Record<Variant, string> = {
  default:
    'bg-[var(--color-bg-subtle)] text-[var(--color-fg-muted)] ' +
    'border border-[var(--color-border)]',
  success:
    'bg-[var(--color-success-soft)] text-[var(--color-success-soft-fg)] ' +
    'border border-transparent',
  warning:
    'bg-[var(--color-warning-soft)] text-[var(--color-warning-soft-fg)] ' +
    'border border-transparent',
  danger:
    'bg-[var(--color-danger-soft)] text-[var(--color-danger-soft-fg)] ' +
    'border border-transparent',
  info:
    'bg-[var(--color-info-soft)] text-[var(--color-info-soft-fg)] ' +
    'border border-transparent',
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { className, variant = 'default', ...props },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 ' +
          'text-[11px] font-medium leading-4',
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  )
})
