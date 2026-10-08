'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { URL_MONITORAMENTO, caminhoMonitoramento, rotaPainelMonitoramento } from '@/lib/sistema-transmonseg'

// Monitoramento aberto dentro da Central (05/10). O sistema continua o mesmo
// (monitoramento.transmonseg.com.br); aqui ele aparece sem a moldura dele e
// avisa a página em que está, pra barra de endereço acompanhar. No
// computador a barra de cima do painel some aqui (tela inteira pro mapa).
export default function Pagina() {
  return <Suspense><MonitoramentoEmbutido /></Suspense>
}

function MonitoramentoEmbutido() {
  const pathname = usePathname()
  const router = useRouter()
  const busca = useSearchParams().toString()
  const alvo = caminhoMonitoramento(pathname) + (busca ? `?${busca}` : '')
  const [src, setSrc] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(false)
  const [tentativa, setTentativa] = useState(0)
  // Último caminho que o próprio monitoramento informou: quando a barra de
  // endereço muda por causa dele, não recarrega o quadro.
  const informado = useRef<string | null>(null)
  const quadro = useRef<HTMLIFrameElement>(null)

  // Login único (08/10): o quadro entra pela rota de entrada do monitoramento
  // com um passe de quem está logado aqui -- antes valia qualquer sessão que já
  // estivesse aberta no navegador (conta da Érica mostrando a Rio Quality).
  useEffect(() => {
    if (informado.current === alvo) return
    let cancelado = false
    setCarregando(true)
    setErro(false)
    fetch('/api/monitoramento/passe', { cache: 'no-store' })
      .then(r => {
        // Sessão do painel vencida: login; conta sem monitoramento: painel.
        if (r.status === 401) { window.location.href = '/login'; return null }
        if (r.status === 403) { router.push('/painel'); return null }
        return r.ok ? r.json() as Promise<{ passe: string }> : Promise.reject(new Error(String(r.status)))
      })
      .then(j => {
        if (j && !cancelado) setSrc(`${URL_MONITORAMENTO}/api/acessos/entrar-central?p=${encodeURIComponent(j.passe)}&para=${encodeURIComponent(alvo)}`)
      })
      .catch(() => { if (!cancelado) { setErro(true); setCarregando(false) } })
    return () => { cancelado = true }
  }, [alvo, tentativa, router])

  useEffect(() => {
    function aoReceber(e: MessageEvent) {
      // Só o quadro atual (um antigo ainda montado durante a troca não manda).
      if (e.origin !== URL_MONITORAMENTO || e.source !== quadro.current?.contentWindow) return
      const m = e.data as { fonte?: string; tipo?: string; caminho?: string; titulo?: string }
      if (m?.fonte !== 'monitoramento' || typeof m.caminho !== 'string') return
      // X da tela "Entrega no mapa": volta pra uma tela do painel (ex. o Ao vivo).
      if (m.tipo === 'navegar-central') {
        if (m.caminho.startsWith('/painel/') && !m.caminho.startsWith('//')) router.push(m.caminho)
        return
      }
      if (m.tipo !== 'rota') return
      informado.current = m.caminho
      const rota = rotaPainelMonitoramento(m.caminho.split('?')[0]) + (m.caminho.includes('?') ? '?' + m.caminho.split('?')[1] : '')
      if (rota !== window.location.pathname + window.location.search) window.history.replaceState(null, '', rota)
    }
    window.addEventListener('message', aoReceber)
    return () => window.removeEventListener('message', aoReceber)
  }, [router])

  return (
    <div className="relative -mx-4 -my-6 h-[calc(100dvh-3.5rem)] md:-mx-10 md:-my-10 md:h-[100dvh]">
      {erro && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[var(--color-bg)] text-sm text-[var(--color-fg-muted)]">
          Não foi possível abrir o monitoramento.
          <button type="button" onClick={() => setTentativa(t => t + 1)} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-[var(--color-fg)]">Tentar de novo</button>
        </div>
      )}
      {carregando && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-bg)]">
          <span className="size-5 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-navy-700)]" />
        </div>
      )}
      {src && <iframe
        ref={quadro}
        key={src}
        src={src}
        title="Monitoramento"
        onLoad={() => setCarregando(false)}
        className="block h-full w-full border-0"
        allow="clipboard-write; fullscreen"
      />}
    </div>
  )
}
