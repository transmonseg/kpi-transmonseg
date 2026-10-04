import { forwardRef } from 'react'
import { cn } from './cn'

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
}

// Estilo Apple: campo preenchido (cinza), sem borda, anel da marca no foco.
const INPUT_BASE =
  'h-11 w-full rounded-[12px] border bg-[var(--color-bg-subtle)] ' +
  'px-3.5 text-[15px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] ' +
  'transition-[border-color,box-shadow,background-color] duration-200 ' +
  'focus-visible:outline-none focus-visible:bg-[var(--color-bg-elevated)] focus-visible:border-[var(--color-accent)] focus-visible:ring-4 focus-visible:ring-[var(--color-accent)]/15 ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        INPUT_BASE,
        invalid
          ? 'border-[var(--color-danger)]'
          : 'border-transparent',
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
          'min-h-[96px] w-full rounded-lg border bg-[var(--color-bg-elevated)] ' +
            'px-3 py-2.5 text-[13px] leading-relaxed text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] ' +
            'transition-[border-color,box-shadow] duration-150 ' +
            'focus-visible:outline-none focus-visible:border-[var(--color-accent)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/15 ' +
            'disabled:cursor-not-allowed disabled:opacity-50',
          invalid
            ? 'border-[var(--color-danger)]'
            : 'border-[var(--color-border)] hover:border-[var(--color-border-strong)]',
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
        // Editorial — Rule 6 do skill (Label sit above input)
        'block text-[13px] font-medium text-[var(--color-fg-muted)]',
        className,
      )}
      {...props}
    />
  )
}
