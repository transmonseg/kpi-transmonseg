import type { Metadata } from 'next'
import { GestorClientes } from './gestor'

export const metadata: Metadata = {
  title: 'Clientes — Cozinha | TRANSMONSEG',
}

export default function ClientesCozinhaPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        <h1 className="text-[28px] font-semibold leading-[1.1] tracking-[-0.022em] text-[var(--color-fg)] sm:text-[34px]">
          Clientes da Cozinha
        </h1>
        <p className="mt-1.5 text-[15px] text-[var(--color-fg-muted)]">
          Gerencie a matriz de clientes usada para gerar os romaneios.
        </p>
      </div>
      <GestorClientes />
    </div>
  )
}
