// Botões em pílula estilo Apple (mesmos do Norte Estoque).
const VARIANTES = {
  primario: 'bg-[var(--color-navy-700)] text-white hover:bg-[var(--color-navy-800)]',
  secundario: 'bg-[var(--color-bg-subtle)] text-[var(--color-fg)] hover:bg-[var(--color-bg-hover)]',
  fantasma: 'text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-fg)]',
  perigo: 'bg-[var(--color-bg-subtle)] text-[var(--color-danger)] hover:bg-[var(--color-bg-hover)]',
} as const

export type VarianteBotao = keyof typeof VARIANTES

export function botao(v: VarianteBotao = 'primario', tamanho: 'md' | 'sm' = 'md'): string {
  const t = tamanho === 'sm' ? 'h-8 px-3.5 text-[13px]' : 'h-9 px-4 text-[14px] max-sm:h-10'
  return `inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-semibold u-motion u-press disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${t} ${VARIANTES[v]}`
}
