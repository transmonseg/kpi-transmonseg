import { ThemeToggle } from '@/lib/theme/ThemeToggle'

// Shell mínimo — link público (sem login) do KPI Manual. Mesmo padrão do
// /dashboard público: sem barra lateral, só header com logo + tema.
export default function KpiPublicoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-[var(--color-bg)] text-[var(--color-fg)]">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg)]/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-bg)]/70 md:px-8">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#1F3864] text-[12px] font-bold text-white">T</span>
          <span className="text-[14px] font-medium tracking-tight text-[var(--color-fg)]">Transmonseg · KPI</span>
        </div>
        <ThemeToggle />
      </header>
      <main className="flex-1 px-4 py-6 md:px-10 md:py-10">{children}</main>
    </div>
  )
}
