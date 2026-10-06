'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { URL_MONITORAMENTO, caminhoMonitoramento, rotaPainelMonitoramento } from '@/lib/sistema-transmonseg'

// Monitoramento aberto dentro da Central (05/10). O sistema continua o mesmo
// (monitoramento.transmonseg.com.br); aqui ele aparece sem a moldura dele e
// avisa a página em que está, pra barra de endereço acompanhar.
export default function Pagina() {
  return <Suspense><MonitoramentoEmbutido /></Suspense>
}

function MonitoramentoEmbutido() {
  const pathname = usePathname()
  const busca = useSearchParams().toString()
  const alvo = caminhoMonitoramento(pathname) + (busca ? `?${busca}` : '')
  const [src, setSrc] = useState(() => URL_MONITORAMENTO + alvo)
  const [carregando, setCarregando] = useState(true)
  // Último caminho que o próprio monitoramento informou: quando a barra de
  // endereço muda por causa dele, não recarrega o quadro.
  const informado = useRef<string | null>(null)

  useEffect(() => {
    if (informado.current === alvo) return
    setSrc(URL_MONITORAMENTO + alvo)
    setCarregando(true)
  }, [alvo])

  useEffect(() => {
    function aoReceber(e: MessageEvent) {
      if (e.origin !== URL_MONITORAMENTO) return
      const m = e.data as { fonte?: string; tipo?: string; caminho?: string; titulo?: string }
      if (m?.fonte !== 'monitoramento' || m.tipo !== 'rota' || typeof m.caminho !== 'string') return
      informado.current = m.caminho
      const rota = rotaPainelMonitoramento(m.caminho.split('?')[0]) + (m.caminho.includes('?') ? '?' + m.caminho.split('?')[1] : '')
      if (rota !== window.location.pathname + window.location.search) window.history.replaceState(null, '', rota)
    }
    window.addEventListener('message', aoReceber)
    return () => window.removeEventListener('message', aoReceber)
  }, [])

  return (
    <div className="relative -mx-4 -my-6 h-[calc(100dvh-3.5rem)] md:-mx-10 md:-my-10">
      {carregando && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-bg)]">
          <span className="size-5 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-navy-700)]" />
        </div>
      )}
      <iframe
        key={src}
        src={src}
        title="Monitoramento"
        onLoad={() => setCarregando(false)}
        className="block h-full w-full border-0"
        allow="clipboard-write; fullscreen"
      />
    </div>
  )
}
