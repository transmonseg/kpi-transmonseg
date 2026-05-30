'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { getTour, subTour, setTour, encerrarTutorial } from '@/lib/tour/store'
import { CAPITULOS, TOTAL_PASSOS, indiceGlobal } from '@/lib/tour/capitulos'
import { TourOverlay } from './tour-overlay'
import { ativarSom, somPasso, somFim } from '@/lib/tour/som'

const snapshotInativo = { ativo: false, cap: 0 }

// Alvo existe no DOM? Gráficos condicionais (sem dados) simplesmente não montam.
const existe = (sel: string) =>
  typeof document !== 'undefined' && !!document.querySelector(sel)

// Próximo índice (na direção dir) cujo elemento existe; -1 se nenhum.
function acharValido(steps: { element: string }[], from: number, dir: 1 | -1): number {
  for (let i = from; i >= 0 && i < steps.length; i += dir) {
    if (existe(steps[i].element)) return i
  }
  return -1
}

export function TourRunner() {
  const { ativo, cap } = useSyncExternalStore(subTour, getTour, () => snapshotInativo)
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [stepIdx, setStepIdx] = useState(0)
  const [pronto, setPronto] = useState(false)
  const entrarNoFim = useRef(false)
  const dir = useRef<1 | -1>(1)
  const fimTocado = useRef(false)

  // Ao trocar de capítulo: primeiro passo (ou o último, se estamos voltando).
  useEffect(() => {
    const c = CAPITULOS[cap]
    if (!c) return
    dir.current = entrarNoFim.current ? -1 : 1
    setStepIdx(entrarNoFim.current ? c.steps.length - 1 : 0)
    entrarNoFim.current = false
  }, [cap])

  // Navegação: leva a tela certa pro capítulo e libera o overlay quando ela casar.
  useEffect(() => {
    if (!ativo) { setPronto(false); return }
    const c = CAPITULOS[cap]
    if (!c) { encerrarTutorial(); return }
    const tabAtual = sp.get('tab') ?? 'geral'
    const casa = pathname === c.pathname && (!c.tab || c.tab === tabAtual)
    if (!casa) {
      setPronto(false)
      router.replace(c.href, { scroll: false })
      return
    }
    // Só espera o tempinho de montagem após navegar. Avançar passo dentro do
    // mesmo capítulo não re-roda este efeito → é instantâneo.
    const t = window.setTimeout(() => setPronto(true), 220)
    return () => window.clearTimeout(t)
  }, [ativo, cap, pathname, sp, router])

  const capitulo = ativo ? CAPITULOS[cap] : null

  // Tela pronta: se o passo atual não existe, pula (na direção atual). Se a tela
  // não tem nenhum passo válido, segue pro próximo capítulo.
  useEffect(() => {
    if (!pronto || !capitulo) return
    const p = capitulo.steps[stepIdx]
    if (p && existe(p.element)) return
    const v = acharValido(capitulo.steps, stepIdx, dir.current)
    if (v >= 0) { setStepIdx(v); return }
    if (cap < CAPITULOS.length - 1) setTour({ cap: cap + 1 })
    else encerrarTutorial()
  }, [pronto, capitulo, stepIdx, cap])

  const passo = capitulo?.steps[stepIdx]
  const ehUltimoCap = !!capitulo && stepIdx === capitulo.steps.length - 1
  const ehFinal = ehUltimoCap && cap === CAPITULOS.length - 1

  // Som + confete ao CHEGAR no passo final (não ao clicar "Concluir").
  useEffect(() => {
    if (ativo && pronto && ehFinal && !fimTocado.current) { fimTocado.current = true; somFim() }
    if (!ehFinal) fimTocado.current = false
  }, [ativo, pronto, ehFinal])

  if (!ativo || !capitulo || !pronto || !passo) return null

  const onNext = () => {
    ativarSom()
    dir.current = 1
    const v = acharValido(capitulo.steps, stepIdx + 1, 1)
    if (v >= 0) { somPasso(); setStepIdx(v); return }
    if (cap >= CAPITULOS.length - 1) { encerrarTutorial(); return }
    somPasso()
    setTour({ cap: cap + 1 })
  }

  const onPrev = () => {
    ativarSom()
    dir.current = -1
    const v = acharValido(capitulo.steps, stepIdx - 1, -1)
    if (v >= 0) { somPasso(); setStepIdx(v); return }
    if (cap > 0) { somPasso(); entrarNoFim.current = true; setTour({ cap: cap - 1 }) }
  }

  return (
    <TourOverlay
      passo={passo}
      idxGlobal={indiceGlobal(cap, stepIdx)}
      total={TOTAL_PASSOS}
      ehUltimoCap={ehUltimoCap}
      ehFinal={ehFinal}
      onNext={onNext}
      onPrev={onPrev}
      onClose={() => encerrarTutorial()}
    />
  )
}
