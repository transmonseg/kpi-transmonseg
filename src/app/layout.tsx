import type { Metadata } from 'next'
import { ThemeProvider, THEME_INIT_SCRIPT } from '@/lib/theme/ThemeProvider'
import 'react-data-grid/lib/styles.css'
import './globals.css'

export const metadata: Metadata = {
  title: 'KPI Transmonseg',
  description: 'Sistema de gestão de escalas e KPI da TRANSMONSEG',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className="h-full antialiased"
    >
      <head>
        <script
          // Anti-FOUC: apply theme class before React mounts.
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
      </head>
      <body className="min-h-full bg-[var(--color-bg)] text-[var(--color-fg)] font-sans">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
