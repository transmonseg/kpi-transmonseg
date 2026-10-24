// Revisão F3-07 (R8): "Subir" no item de OUTRO cliente do checklist chamava
// trocarCliente (estado zerado, tela vira esqueleto) e rolava num setTimeout
// de 150 ms -- antes de #subir-romaneio existir. A rolagem agora espera a
// tela do cliente carregar.
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { act, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useRolarQuandoPronto } from './rolar-quando-pronto'

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })

type Controles = { pedir: (id: string) => void; carregar: (v: boolean) => void }
const ctl: Controles = { pedir: () => {}, carregar: () => {} }
function Tela({ expor }: { expor: (c: Controles) => void }) {
  const [carregado, setCarregado] = useState(false)
  const pedir = useRolarQuandoPronto(carregado)
  useEffect(() => { expor({ pedir, carregar: setCarregado }) }, [expor, pedir])
  return carregado ? <section id="subir-romaneio">envio</section> : <div>carregando</div>
}
const expor = (c: Controles) => { ctl.pedir = c.pedir; ctl.carregar = c.carregar }
const pedir = (id: string) => ctl.pedir(id)
const carregar = (v: boolean) => ctl.carregar(v)

describe('useRolarQuandoPronto', () => {
  it('pedido feito com a tela ainda carregando (troca de cliente): rola quando #subir-romaneio aparece, uma vez só', async () => {
    const rolar = vi.fn()
    Element.prototype.scrollIntoView = rolar
    const el = document.createElement('div')
    document.body.appendChild(el)
    const root = createRoot(el)
    await act(async () => root.render(<Tela expor={expor} />))
    await act(async () => pedir('subir-romaneio'))
    await new Promise(r => setTimeout(r, 200))
    expect(rolar).not.toHaveBeenCalled()
    await act(async () => carregar(true))
    expect(rolar).toHaveBeenCalledTimes(1)
    expect((rolar.mock.contexts[0] as HTMLElement).id).toBe('subir-romaneio')
    await act(async () => carregar(true))
    expect(rolar).toHaveBeenCalledTimes(1)
    await act(async () => root.unmount())
  })

  it('mesmo cliente (tela já carregada): rola na hora', async () => {
    const rolar = vi.fn()
    Element.prototype.scrollIntoView = rolar
    const el = document.createElement('div')
    document.body.appendChild(el)
    const root = createRoot(el)
    await act(async () => root.render(<Tela expor={expor} />))
    await act(async () => carregar(true))
    await act(async () => pedir('subir-romaneio'))
    expect(rolar).toHaveBeenCalledTimes(1)
    await act(async () => root.unmount())
  })
})
