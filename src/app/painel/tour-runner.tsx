'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { getTour, subTour, setTour, encerrarTutorial } from '@/lib/tour/store'
import { CAPITULOS, TOTAL_PASSOS, indiceGlobal } from '@/lib/tour/capitulos'
import { TourOverlay } from './tour-overlay'
import { ativarSom, somPasso, somFim } from '@/lib/tour/som'

const snapshotInativo = { ativo: false, cap: 0 }

export function TourRunner() {
  const { ativo, cap } = useSyncExternalStore(subTour, getTour, () => snapshotInativo)
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [stepIdx, setStepIdx] = useState(0)
  const [pronto, setPronto] = useState(false)
  // quando voltamos de capítulo, queremos cair no ÚLTIMO passo do anterior.
  const entrarNoFim = useRef(false)
  // garante que o som de conclusão toque uma vez só.
  const fimTocado = useRef(false)

  // Ao trocar de capítulo: posiciona no primeiro passo (ou no último, se voltando).
  useEffect(() => {
    const c = CAPITULOS[cap]
    if (!c) return
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
    // Só espera o tempinho de montagem após uma navegação de tela. Avançar passo
    // dentro do mesmo capítulo não re-roda este efeito → é instantâneo.
    const t = window.setTimeout(() => setPronto(true), 220)
    return () => window.clearTimeout(t)
  }, [ativo, cap, pathname, sp, router])

  const capitulo = ativo ? CAPITULOS[cap] : null
  const passo = capitulo?.steps[stepIdx]
  const ehUltimoCap = !!capitulo && stepIdx === capitulo.steps.length - 1
  const ehFinal = ehUltimoCap && cap === CAPITULOS.length - 1

  // Som + confete de conclusão ao CHEGAR no passo final (não ao clicar "Concluir").
  useEffect(() => {
    if (ativo && pronto && ehFinal && !fimTocado.current) {
      fimTocado.current = true
      somFim()
    }
    if (!ehFinal) fimTocado.current = false
  }, [ativo, pronto, ehFinal])

  if (!ativo || !capitulo || !pronto || !passo) return null

  const onNext = () => {
    ativarSom()
    if (!ehUltimoCap) { somPasso(); setStepIdx((i) => i + 1); return }
    if (ehFinal) { encerrarTutorial(); return }
    somPasso()
    setTour({ cap: cap + 1 })
  }

  const onPrev = () => {
    ativarSom()
    if (stepIdx > 0) { somPasso(); setStepIdx((i) => i - 1); return }
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
