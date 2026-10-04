'use client'

import { useState } from 'react'
import { Copy, Check } from '@phosphor-icons/react/dist/ssr'
import { Button } from '@/components/ui'

export function CopiarLink({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false)

  return (
    <Button
      type="button"
      variant={copiado ? 'primary' : 'secondary'}
      size="sm"
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
    </Button>
  )
}
