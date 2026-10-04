import type { Metadata } from 'next'
import { GestorClientes } from './gestor'

export const metadata: Metadata = {
  title: 'Clientes — Cozinha | TRANSMONSEG',
}

export default function ClientesCozinhaPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        <span className="text-overline">Cozinha</span>
        <h1 className="mt-1 text-display text-[34px] leading-none text-[var(--color-fg)] md:text-[40px]">
          Clientes da Cozinha
        </h1>
        <p className="mt-2 text-[13px] text-[var(--color-fg-muted)]">
          Gerencie a matriz de clientes usada para gerar os romaneios.
        </p>
      </div>
      <GestorClientes />
    </div>
  )
}
