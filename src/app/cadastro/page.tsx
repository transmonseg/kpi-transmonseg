import Link from 'next/link'
import { Button, Card, CardContent, Input, Label } from '@/components/ui'
import { ThemeToggle } from '@/lib/theme/ThemeToggle'
import { cadastrar } from './actions'

export default async function CadastroPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; sucesso?: string }>
}) {
  const { erro, sucesso } = await searchParams

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[var(--color-bg-subtle)] px-6">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-[380px]">
        <div className="mb-6 flex flex-col items-center text-center">
          <Link
            href="/"
            className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-accent)] text-[13px] font-bold text-[var(--color-accent-fg)]"
          >
            T
          </Link>
          <h1 className="text-[20px] font-semibold tracking-tight text-[var(--color-fg)]">
            Criar conta
          </h1>
          <p className="mt-1 text-[13px] text-[var(--color-fg-muted)]">
            Cadastre-se para acessar o painel.
          </p>
        </div>

        <Card>
          <CardContent className="p-6">
            <form action={cadastrar} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="voce@empresa.com"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="senha">Senha</Label>
                <Input
                  id="senha"
                  name="senha"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  placeholder="Mínimo 6 caracteres"
                />
              </div>

              {erro && (
                <div
                  role="alert"
                  className="rounded-md border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] px-3 py-2 text-[12px] text-[var(--color-danger-soft-fg)]"
                >
                  {decodeURIComponent(erro)}
                </div>
              )}

              {sucesso && (
                <div
                  role="status"
                  className="rounded-md border border-[var(--color-success)]/30 bg-[var(--color-success-soft)] px-3 py-2 text-[12px] text-[var(--color-success-soft-fg)]"
                >
                  {decodeURIComponent(sucesso)}
                </div>
              )}

              <Button type="submit" size="lg" fullWidth className="mt-1">
                Criar conta
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-5 text-center text-[13px] text-[var(--color-fg-muted)]">
          Já tem conta?{' '}
          <Link
            href="/login"
            className="font-medium text-[var(--color-accent)] hover:underline"
          >
            Entrar
          </Link>
        </p>
      </div>
    </div>
  )
}
