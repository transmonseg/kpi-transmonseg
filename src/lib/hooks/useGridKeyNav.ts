import { useEffect } from 'react'

export function useGridKeyNav(onNext: () => void, onPrev: () => void) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (document.activeElement as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'j') { e.preventDefault(); onNext() }
      if (e.key === 'k') { e.preventDefault(); onPrev() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onNext, onPrev])
}
