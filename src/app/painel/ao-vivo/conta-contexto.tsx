'use client'

import { createContext, useContext } from 'react'

// Papel de quem está logado, para a tela do Ao vivo (F3-12): o layout (servidor)
// já lê o perfil; o formulário do romaneio só precisa saber se é a conta admin.
const PapelAoVivo = createContext<string | null>(null)

export function ContaAoVivo({ papel, children }: { papel: string; children: React.ReactNode }) {
  return <PapelAoVivo.Provider value={papel}>{children}</PapelAoVivo.Provider>
}

export function usePapelAoVivo(): string | null {
  return useContext(PapelAoVivo)
}
