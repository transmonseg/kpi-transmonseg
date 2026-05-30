import { forwardRef } from 'react'
import { cn } from './cn'

type DivProps = React.HTMLAttributes<HTMLDivElement>

export const Card = forwardRef<HTMLDivElement, DivProps>(function Card(
  { className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        // radius card (1.5rem) + border 1px sutil + shadow-soft tinted (skill section 9)
        'rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-soft transition-[box-shadow,border-color,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
        className,
      )}
      {...props}
    />
  )
})

export const CardHeader = forwardRef<HTMLDivElement, DivProps>(
  function CardHeader({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          'flex flex-col gap-1.5 border-b border-[var(--color-border)] px-6 py-5',
          className,
        )}
        {...props}
      />
    )
  },
)

export const CardTitle = forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(function CardTitle({ className, ...props }, ref) {
  return (
    <h3
      ref={ref}
      className={cn(
        'text-[15px] font-semibold tracking-tight text-[var(--color-fg)]',
        className,
      )}
      {...props}
    />
  )
})

export const CardDescription = forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(function CardDescription({ className, ...props }, ref) {
  return (
    <p
      ref={ref}
      className={cn('text-[13px] leading-relaxed text-[var(--color-fg-muted)]', className)}
      {...props}
    />
  )
})

export const CardContent = forwardRef<HTMLDivElement, DivProps>(
  function CardContent({ className, ...props }, ref) {
    return <div ref={ref} className={cn('px-6 py-5', className)} {...props} />
  },
)

export const CardFooter = forwardRef<HTMLDivElement, DivProps>(
  function CardFooter({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          'flex items-center justify-end gap-2 border-t border-[var(--color-border)] px-6 py-4',
          className,
        )}
        {...props}
      />
    )
  },
)

/** Eyebrow editorial — uppercase tracking 0.18em, padrão do redesign */
export function Eyebrow({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]',
        className,
      )}
    >
      {children}
    </span>
  )
}
