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
        'rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[0_1px_0_0_rgba(0,0,0,0.02)] dark:shadow-none',
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
          'flex flex-col gap-1 border-b border-[var(--color-border)] px-5 py-4',
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
        'text-sm font-semibold tracking-tight text-[var(--color-fg)]',
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
      className={cn('text-xs text-[var(--color-fg-muted)]', className)}
      {...props}
    />
  )
})

export const CardContent = forwardRef<HTMLDivElement, DivProps>(
  function CardContent({ className, ...props }, ref) {
    return <div ref={ref} className={cn('px-5 py-4', className)} {...props} />
  },
)

export const CardFooter = forwardRef<HTMLDivElement, DivProps>(
  function CardFooter({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          'flex items-center justify-end gap-2 border-t border-[var(--color-border)] px-5 py-3',
          className,
        )}
        {...props}
      />
    )
  },
)
