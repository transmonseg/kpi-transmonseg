import { forwardRef } from 'react'
import { cn } from './cn'

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'h-9 w-full rounded-md border bg-[var(--color-bg-subtle)] ' +
          'px-3 text-[13px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] ' +
          'transition-colors ' +
          'focus-visible:outline-none focus-visible:border-[var(--color-accent)] ' +
          'focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30 ' +
          'disabled:cursor-not-allowed disabled:opacity-50',
        invalid
          ? 'border-[var(--color-danger)]'
          : 'border-[var(--color-border)]',
        className,
      )}
      {...props}
    />
  )
})

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, invalid, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          'min-h-[80px] w-full rounded-md border bg-[var(--color-bg-subtle)] ' +
            'px-3 py-2 text-[13px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] ' +
            'transition-colors ' +
            'focus-visible:outline-none focus-visible:border-[var(--color-accent)] ' +
            'focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30 ' +
            'disabled:cursor-not-allowed disabled:opacity-50',
          invalid
            ? 'border-[var(--color-danger)]'
            : 'border-[var(--color-border)]',
          className,
        )}
        {...props}
      />
    )
  },
)

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        'block text-[12px] font-medium text-[var(--color-fg-muted)]',
        className,
      )}
      {...props}
    />
  )
}
