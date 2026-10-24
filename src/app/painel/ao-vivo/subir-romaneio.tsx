'use client'

import { useState } from 'react'
import { WarningCircle } from '@phosphor-icons/react/dist/ssr'
import { FileDropzone } from '@/app/painel/file-dropzone'
import { buscarComSessao, SessaoVencida } from '@/lib/sessao-fetch'

// Romaneio do dia: os mesmos PDFs da tela Gerar KPI, subidos de manhã.
// O KPI guarda só o que leu deles (não o arquivo) e começa a calcular.
export type EnvioRomaneio = { nfs: number; placas: number; monitoramento?: { origem: 'romaneio' | 'escala_pao'; ok: boolean; linhas?: number; erro?: string }[] }

export function SubirRomaneio({ cliente, compacto, onEnviado }: { cliente: string; compacto?: boolean; onEnviado: (r: EnvioRomaneio) => void }) {
  const [romaneio, setRomaneio] = useState<File[]>([])
  const [escala, setEscala] = useState<File[]>([])
  const [pao, setPao] = useState<File[]>([])
  const rq = cliente === 'rioquality'
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function enviar() {
    if (!romaneio[0] && !(compacto && !rq && (escala[0] || pao[0]))) return
    setEnviando(true)
    setErro(null)
    const fd = new FormData()
    fd.set('cliente', cliente)
    if (romaneio[0]) fd.set(rq ? 'completo' : 'romaneio', romaneio[0])
    if (escala[0]) fd.set('escala', escala[0])
    if (pao[0]) fd.set('romaneioPao', pao[0])
    // F3-11: sessão vencida leva ao login em vez de mostrar o JSON do 401.
    const r = await buscarComSessao('/api/kpi/ao-vivo/romaneio', { method: 'POST', body: fd }).catch(e => { setEnviando(false); if (!(e instanceof SessaoVencida)) setErro('Sem conexão com o servidor. Tente de novo.'); return null })
    if (!r) return
    setEnviando(false)
    if (!r.ok) { setErro(await r.text()); return }
    const resp = (await r.json()) as EnvioRomaneio
    setRomaneio([]); setEscala([]); setPao([])
    onEnviado(resp)
  }

  async function puxarFusion() {
    setEnviando(true)
    setErro(null)
    try {
      const r = await fetch('/api/kpi/ao-vivo/fusion?cliente=rioquality', { method: 'POST' })
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; motivo?: string; nfs?: number; placas?: number }
      if (!r.ok) {
        setErro(j.motivo === 'sem_dados_fusion'
          ? 'A Fusion ainda não tem romaneio do dia — use o upload da planilha.'
          : `Não deu pra puxar da Fusion (${j.motivo ?? r.status}).`)
        return
      }
      onEnviado({ nfs: j.nfs ?? 0, placas: j.placas ?? 0 })
    } catch {
      setErro('Falha ao falar com a Fusion. Use o upload da planilha.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {rq ? (
        <div className="grid gap-4 md:max-w-md">
          <button type="button" disabled={enviando} onClick={puxarFusion}
            className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--color-navy-700)] px-6 text-[14px] font-semibold text-[var(--color-navy-700)] transition hover:bg-[var(--color-navy-50)] active:scale-[0.98] disabled:opacity-40">
            {enviando ? 'Aguarde…' : 'Puxar da Fusion'}
          </button>
          <FileDropzone eyebrow="Obrigatório" label="Relatório de Entregas" hint="Planilha (xlsx) do dia exportada do sistema da Rio Quality" accept=".xlsx,.xls" files={romaneio} onAdd={f => setRomaneio(f.slice(0, 1))} onRemove={() => setRomaneio([])} />
        </div>
      ) : (
      <div className={compacto ? 'grid gap-3 md:grid-cols-3' : 'grid gap-4 md:grid-cols-3'}>
        <FileDropzone eyebrow={compacto ? 'Já enviado' : 'Obrigatório'} label="Romaneio de Entrega" hint={compacto ? 'Só envie se quiser trocar o do dia' : 'PDF com as cargas, NFs e clientes do dia'} accept=".pdf" files={romaneio} onAdd={f => setRomaneio(f.slice(0, 1))} onRemove={() => setRomaneio([])} />
        <FileDropzone eyebrow="Opcional" label="Escala de Rota" hint="PDF · traz o peso (KG) e o rastreador da escala" accept=".pdf" files={escala} onAdd={f => setEscala(f.slice(0, 1))} onRemove={() => setEscala([])} />
        <FileDropzone eyebrow="Opcional" label="Romaneio do Pão" hint="PDF do pão, se tiver hoje" accept=".pdf" files={pao} onAdd={f => setPao(f.slice(0, 1))} onRemove={() => setPao([])} />
      </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={enviar} disabled={(!romaneio[0] && !(compacto && !rq && (escala[0] || pao[0]))) || enviando}
          className="inline-flex h-11 items-center rounded-full bg-[var(--color-navy-700)] px-6 text-[14px] font-semibold text-white transition hover:bg-[var(--color-navy-800)] active:scale-[0.98] disabled:opacity-40">
          {enviando ? (rq ? 'Lendo a planilha…' : 'Lendo os PDFs…') : compacto && !rq ? 'Enviar' : 'Começar o acompanhamento'}
        </button>
        {erro && <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-danger)]"><WarningCircle size={16} weight="fill" />{erro}</span>}
      </div>
    </div>
  )
}
