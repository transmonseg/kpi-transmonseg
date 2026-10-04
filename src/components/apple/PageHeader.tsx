/** Cabeçalho de página estilo Apple: título grande, descrição curta em cinza,
 *  ações à direita (quebram linha no celular). Sem ícone ao lado do título. */
export function PageHeader({ title, description, actions, children }: {
  title: string
  description?: React.ReactNode
  actions?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[28px] font-semibold leading-[1.1] tracking-[-0.022em] text-[var(--color-fg)] sm:text-[34px]">{title}</h1>
          {description && <p className="mt-1.5 text-[15px] text-[var(--color-fg-muted)]">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}
