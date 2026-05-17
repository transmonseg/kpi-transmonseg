import { forwardRef } from 'react'
import { cn } from './cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'invert'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  fullWidth?: boolean
}

const BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium ' +
  'transition-all duration-150 active:scale-[0.97] ' +
  'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0 ' +
  'select-none whitespace-nowrap'

const VARIANTS: Record<Variant, string> = {
  // Brand acento — usar com parcimônia (skill: 1 accent só)
  primary:
    'bg-[var(--color-accent)] text-[var(--color-accent-fg)] ' +
    'hover:bg-[var(--color-accent-hover)] ' +
    'focus-visible:ring-[var(--color-accent)]',
  // CTA escuro invariante — navy funciona em light e dark
  invert:
    'bg-[var(--color-navy-700)] text-white ' +
    'hover:opacity-90 ' +
    'focus-visible:ring-[var(--color-navy-700)]',
  secondary:
    'border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] ' +
    'text-[var(--color-fg)] ' +
    'hover:border-[var(--color-fg-muted)] hover:bg-[var(--color-bg-elevated)] ' +
    'focus-visible:ring-[var(--color-fg)]',
  ghost:
    'bg-transparent text-[var(--color-fg-muted)] ' +
    'hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-fg)] ' +
    'focus-visible:ring-[var(--color-fg)]',
  danger:
    'bg-[var(--color-danger)] text-white ' +
    'hover:opacity-90 focus-visible:ring-[var(--color-danger)]',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[12px]',
  md: 'h-9 px-4 text-[13px]',
  lg: 'h-11 px-5 text-[14px]',
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
