import { forwardRef } from 'react'
import { cn } from './cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  fullWidth?: boolean
}

const BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-md font-medium ' +
  'transition-colors disabled:cursor-not-allowed disabled:opacity-50 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0 ' +
  'select-none whitespace-nowrap'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-[var(--color-accent)] text-[var(--color-accent-fg)] ' +
    'hover:bg-[var(--color-accent-hover)] ' +
    'focus-visible:ring-[var(--color-accent)]',
  secondary:
    'border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] ' +
    'text-[var(--color-fg)] ' +
    'hover:bg-[var(--color-bg-hover)] ' +
    'focus-visible:ring-[var(--color-accent)]',
  ghost:
    'bg-transparent text-[var(--color-fg-muted)] ' +
    'hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-fg)] ' +
    'focus-visible:ring-[var(--color-accent)]',
  danger:
    'bg-[var(--color-danger)] text-white ' +
    'hover:opacity-90 focus-visible:ring-[var(--color-danger)]',
}

const SIZES: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-[12px]',
  md: 'h-8 px-3 text-[13px]',
  lg: 'h-10 px-4 text-sm',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = 'primary',
    size = 'md',
    fullWidth,
    type = 'button',
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        BASE,
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    />
  )
})
