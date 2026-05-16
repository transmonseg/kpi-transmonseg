import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { ThemeProvider, THEME_INIT_SCRIPT } from '@/lib/theme/ThemeProvider'
import './globals.css'

const geistSans = Geist({
  variable: '--font-sans',
  subsets: ['latin'],
  display: 'swap',
})

const geistMono = Geist_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'KPI TRANSMONSEG',
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
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
