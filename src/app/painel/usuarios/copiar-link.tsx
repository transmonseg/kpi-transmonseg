'use client'

import { useState } from 'react'
import { Copy, Check } from '@phosphor-icons/react/dist/ssr'
import { botao } from '@/components/apple/botao'

export function CopiarLink({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false)

  return (
    <button
      type="button"
      className={botao(copiado ? 'primario' : 'secundario', 'sm')}
      onClick={() => {
        navigator.clipboard.writeText(texto).then(() => {
          setCopiado(true)
          setTimeout(() => setCopiado(false), 2000)
        })
      }}
    >
      {copiado ? (
        <>
          <Check size={13} weight="bold" /> Copiado!
        </>
      ) : (
        <>
          <Copy size={13} weight="bold" /> Copiar link
        </>
      )}
    </button>
  )
}
