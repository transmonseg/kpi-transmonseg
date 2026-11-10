'use client'

// 09/11: confirmar a entrega direto na nota do Ao vivo (sem abrir a fila
// Conferir). Vale na hora: a nota vira entregue, a taxa anda e o monitoramento
// para de cobrar o cliente. "Desfazer" volta ao automático.
import { useState } from 'react'
import { CheckCircle, ArrowCounterClockwise } from '@phosphor-icons/react/dist/ssr'
import type { NfAoVivo } from '@/lib/kpi-romaneio/ao-vivo'
import { buscarComSessao } from '@/lib/sessao-fetch'
import { nfSemNumeroReal } from '@/lib/kpi-romaneio/fila-conferir'

type Cliente = 'nutrimax' | 'rioquality'
const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ' às')

export function ConfirmarNf({ n, cliente, data, onMudou }: { n: NfAoVivo; cliente: Cliente; data: string; onMudou: () => void }) {
  const [aberto, setAberto] = useState(false)
  const [obs, setObs] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  if (nfSemNumeroReal(cliente, n.nf) || n.nf.startsWith('SEMNF')) return null

  async function enviar(acao: 'confirmar' | 'desfazer') {
    const fd = new FormData()
    fd.set('data', data); fd.set('nf', n.nf); fd.set('acao', acao)
    if (acao === 'confirmar' && obs.trim()) fd.set('observacao', obs.trim())
    setEnviando(true); setErro(null)
    try {
      const r = await buscarComSessao(`/api/kpi/resolucao?cliente=${cliente}`, { method: 'POST', body: fd })
      if (!r.ok) { setErro(await r.text()); return }
      setAberto(false); setObs('')
      onMudou()
    } catch {
      setErro('Não consegui falar com o servidor. Tente de novo.')
    } finally {
      setEnviando(false)
    }
  }

  const c = n.conferencia
  if (c) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-[var(--color-border)] px-3.5 py-2.5 text-[12.5px] text-[var(--color-fg)]">
        <span><strong className="font-semibold">{c.rotulo}</strong> por {c.responsavel} em {quando(c.em)}.</span>
        <button type="button" disabled={enviando} onClick={() => void enviar('desfazer')}
          className="inline-flex items-center gap-1 font-semibold text-[var(--color-navy-700)] hover:underline disabled:opacity-50">
          <ArrowCounterClockwise size={13} weight="bold" />{enviando ? 'Desfazendo…' : 'Desfazer'}
        </button>
        {erro && <span role="alert" className="font-semibold text-[var(--color-danger)]">{erro}</span>}
      </div>
    )
  }
  if (n.situacao === 'entregue' || n.situacao === 'sem_rastreador') return null
  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)}
        className="inline-flex h-9 items-center gap-2 self-start rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-4 text-[12.5px] font-semibold text-[var(--color-fg)] transition hover:border-[var(--color-border-strong)] active:scale-[0.98]">
        <CheckCircle size={15} weight="bold" />Confirmar entrega
      </button>
    )
  }
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[var(--color-border)] px-3.5 py-3">
      <p className="text-[12.5px] text-[var(--color-fg-muted)]">Conferiu na Unitrac, com o motorista ou com o cliente? A nota vira entregue e entra na taxa agora. Seu nome fica registrado.</p>
      <label className="flex flex-col gap-1 text-[12px] text-[var(--color-fg-muted)]">Como conferiu (opcional)
        <input value={obs} onChange={e => setObs(e.target.value)} maxLength={300} placeholder="ex.: parou na portaria do condomínio, conferido na Unitrac"
          className="h-9 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 text-[13px] text-[var(--color-fg)]" />
      </label>
      <div className="flex items-center gap-3">
        <button type="button" disabled={enviando} onClick={() => void enviar('confirmar')}
          className="inline-flex h-9 items-center gap-2 rounded-full bg-[var(--color-navy-700)] px-4 text-[12.5px] font-semibold text-white transition hover:bg-[var(--color-navy-800)] disabled:opacity-50">
          <CheckCircle size={15} weight="bold" />{enviando ? 'Confirmando…' : 'Confirmar entrega'}
        </button>
        <button type="button" onClick={() => { setAberto(false); setErro(null) }} className="text-[12.5px] font-semibold text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Cancelar</button>
      </div>
      {erro && <p role="alert" className="text-[12.5px] font-semibold text-[var(--color-danger)]">{erro}</p>}
    </div>
  )
}
