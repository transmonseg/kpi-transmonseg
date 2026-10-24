import { useCallback, useEffect, useRef, useState } from 'react'

/** Revisão F3-07 (R8): pede para rolar até um elemento que talvez ainda não
 *  exista (trocar de cliente zera o estado e a tela vira esqueleto até a
 *  carga). A rolagem acontece no primeiro commit com `pronto`, uma vez por
 *  pedido; se mesmo pronto o elemento não aparecer, o pedido cai (nada de
 *  rolagem surpresa depois). Devolve a função que faz o pedido (id do elemento). */
export function useRolarQuandoPronto(pronto: boolean): (id: string) => void {
  const [pedido, setPedido] = useState<{ id: string; n: number } | null>(null)
  const atendido = useRef(0)
  useEffect(() => {
    if (!pedido || !pronto || atendido.current === pedido.n) return
    atendido.current = pedido.n
    document.getElementById(pedido.id)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [pedido, pronto])
  return useCallback((id: string) => setPedido(p => ({ id, n: (p?.n ?? 0) + 1 })), [])
}
