'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { driver, type Driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { getTour, subTour, setTour, encerrarTutorial } from '@/lib/tour/store'
import { CAPITULOS } from '@/lib/tour/capitulos'

const snapshotInativo = { ativo: false, cap: 0 }

export function TourRunner() {
  const { ativo, cap } = useSyncExternalStore(subTour, getTour, () => snapshotInativo)
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const driverRef = useRef<Driver | null>(null)
  // true enquanto avançamos de capítulo programaticamente — evita que o
  // onDestroyStarted interprete a destruição como "usuário fechou".
  const avancando = useRef(false)
  // guarda contra re-entrada no destroy (onDestroyStarted chama destroy()).
  const destruindo = useRef(false)

  useEffect(() => {
    // destrói o driver de forma idempotente (re-entrada via onDestroyStarted).
    const destruirDriver = () => {
      if (destruindo.current) return
      destruindo.current = true
      driverRef.current?.destroy()
      driverRef.current = null
      destruindo.current = false
    }

    if (!ativo) {
      destruirDriver()
      return
    }

    const capitulo = CAPITULOS[cap]
    if (!capitulo) {
      encerrarTutorial()
      return
    }

    // A tela atual bate com o capítulo? (pathname + aba via ?tab=)
    const tabAtual = sp.get('tab') ?? 'geral'
    const telaCasa =
      pathname === capitulo.pathname && (!capitulo.tab || capitulo.tab === tabAtual)

    if (!telaCasa) {
      // Navega pra tela do capítulo; ao chegar, o efeito re-roda e telaCasa=true.
      router.replace(capitulo.href, { scroll: false })
      return
    }

    // Delay pra garantir que os elementos do capítulo já montaram (dados/abas).
    const start = window.setTimeout(() => {
      const ehUltimoCap = cap === CAPITULOS.length - 1

      // Avança pro próximo capítulo: marca o flag e troca o cap. O teardown do
      // driver atual fica a cargo do cleanup do efeito (cap mudou).
      const irProximoCapitulo = () => {
        avancando.current = true
        setTour({ cap: cap + 1 })
      }

      const d = driver({
        showProgress: true,
        progressText: 'Passo {{current}} de {{total}}',
        nextBtnText: 'Próximo',
        prevBtnText: 'Voltar',
        doneBtnText: ehUltimoCap ? 'Concluir' : 'Próxima tela',
        animate: true,
        smoothScroll: true,
        allowClose: true,
        overlayColor: '#0a0a0a',
        overlayOpacity: 0.6,
        stagePadding: 8,
        stageRadius: 14,
        popoverClass: 'driver-popover-navy',
        steps: capitulo.steps,
        // "Próximo"/"Concluir": como definimos o hook, o driver NÃO avança
        // sozinho — nós controlamos. No último passo do capítulo: encerra (se
        // for o último capítulo) ou pula pro próximo capítulo (navega de tela).
        onNextClick: () => {
          const drv = driverRef.current
          if (drv && !drv.isLastStep()) {
            drv.moveNext()
            return
          }
          if (ehUltimoCap) {
            encerrarTutorial()
          } else {
            irProximoCapitulo()
          }
        },
        // Fechar (X no popover, clique na overlay ou ESC) passa por
        // onDestroyStarted. Como definimos o hook, o driver NÃO se destrói
        // sozinho — precisamos chamar destroy(). Se foi avanço programático,
        // só limpa o flag; caso contrário foi o usuário fechando → encerra.
        onDestroyStarted: () => {
          if (!avancando.current) encerrarTutorial()
          avancando.current = false
          destruirDriver()
        },
      })
      driverRef.current = d
      d.drive()
    }, 450)

    return () => {
      window.clearTimeout(start)
      destruirDriver()
    }
  }, [ativo, cap, pathname, sp, router])

  return null
}
