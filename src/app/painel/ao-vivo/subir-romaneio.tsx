'use client'

import { useState } from 'react'
import { WarningCircle, Info, CheckCircle, Question, X } from '@phosphor-icons/react/dist/ssr'
import { FileDropzone } from '@/app/painel/file-dropzone'
import { buscarComSessao, SessaoVencida } from '@/lib/sessao-fetch'
import { avisoContaAdmin } from '@/lib/destino-login'
import type { ArquivoNoRecibo } from '@/lib/kpi-romaneio/reconhecer-arquivo'
import { usePapelAoVivo } from './conta-contexto'
import { DOCUMENTOS_DO_CLIENTE, juntarReconhecidos, montarEnvio, respostaArquivoDesconhecido, type ClienteTela, type EscolhaCliente, type ItemArquivo } from './arquivos-do-dia'

// Romaneio do dia: os mesmos documentos da tela Gerar KPI, subidos de manhã.
// F3-06 (ING-10): uma área só, "Solte os arquivos do dia" -- o sistema diz o
// que cada arquivo é pela assinatura do documento (não pela caixa em que caiu),
// e o recibo do envio traz as contagens e as divergências, sem bloquear.
export type EnvioRomaneio = {
  nfs: number; placas: number
  monitoramento?: { origem: 'romaneio' | 'escala_pao'; ok: boolean; linhas?: number; erro?: string }[]
  /** F3-06: o que foi enviado (resumo de cada arquivo) e as divergências do dia. */
  arquivos?: string[]
  recibo?: { avisos: { tipo: string; texto: string }[] }
}

const ESCOLHAS: { valor: EscolhaCliente; rotulo: string }[] = [
  { valor: 'nutrimax', rotulo: 'Nutry Max' }, { valor: 'rioquality', rotulo: 'Rio Quality' },
  { valor: 'portofrio', rotulo: 'Porto Frio' }, { valor: 'outro', rotulo: 'Outro' },
]
let seq = 0

export function SubirRomaneio({ cliente, compacto, onEnviado }: { cliente: ClienteTela; compacto?: boolean; onEnviado: (r: EnvioRomaneio) => void }) {
  const [itens, setItens] = useState<ItemArquivo[]>([])
  const [lendo, setLendo] = useState(false)
  const rq = cliente === 'rioquality'
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  // F3-12 (AC-07): aviso discreto quando a conta admin compartilhada sobe o romaneio.
  const avisoAdmin = avisoContaAdmin(usePapelAoVivo())
  const envio = montarEnvio(itens, cliente, !!compacto)

  async function reconhecer(files: File[]) {
    setErro(null)
    setLendo(true)
    const novos: ItemArquivo[] = files.map(file => ({ id: `${++seq}`, file, info: null }))
    try {
      const fd = new FormData()
      fd.set('cliente', cliente)
      for (const f of files) fd.append('arquivos', f)
      const r = await buscarComSessao('/api/kpi/ao-vivo/reconhecer', { method: 'POST', body: fd })
      if (!r.ok) { setErro(await r.text()); return }
      const j = (await r.json()) as { arquivos: ArquivoNoRecibo[] }
      setItens(atuais => juntarReconhecidos(atuais, novos.map((n, i) => ({ ...n, info: j.arquivos[i] ?? null }))))
    } catch (e) {
      if (!(e instanceof SessaoVencida)) setErro('Sem conexão com o servidor. Tente de novo.')
    } finally {
      setLendo(false)
    }
  }

  async function enviar() {
    if (!envio.podeEnviar) return
    setEnviando(true)
    setErro(null)
    const fd = new FormData()
    fd.set('cliente', cliente)
    for (const c of envio.campos) fd.set(c.campo, c.file)
    // F3-11: sessão vencida leva ao login em vez de mostrar o JSON do 401.
    const r = await buscarComSessao('/api/kpi/ao-vivo/romaneio', { method: 'POST', body: fd }).catch(e => { setEnviando(false); if (!(e instanceof SessaoVencida)) setErro('Sem conexão com o servidor. Tente de novo.'); return null })
    if (!r) return
    setEnviando(false)
    if (!r.ok) { setErro(await r.text()); return }
    const resp = (await r.json()) as EnvioRomaneio
    const resumos = itens.filter(i => i.info?.serve).map(i => i.info!.resumo)
    setItens([])
    onEnviado({ ...resp, arquivos: resumos })
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

  const escolher = (id: string, escolha: EscolhaCliente) => setItens(xs => xs.map(x => (x.id === id ? { ...x, escolha } : x)))
  const remover = (id: string) => setItens(xs => xs.filter(x => x.id !== id))

  return (
    <div className="flex flex-col gap-4">
      {rq && (
        <button type="button" disabled={enviando} onClick={puxarFusion}
          className="inline-flex h-11 w-fit items-center justify-center rounded-full border border-[var(--color-navy-700)] px-6 text-[14px] font-semibold text-[var(--color-navy-700)] transition hover:bg-[var(--color-navy-50)] active:scale-[0.98] disabled:opacity-40">
          {enviando ? 'Aguarde…' : 'Puxar da Fusion'}
        </button>
      )}
      <FileDropzone
        className="md:max-w-2xl"
        eyebrow={compacto ? 'Só se quiser trocar ou completar' : 'Romaneio do dia'}
        label="Solte os arquivos do dia"
        hint={`${DOCUMENTOS_DO_CLIENTE[cliente]}. Pode soltar todos juntos: o sistema reconhece cada um.`}
        accept={rq ? '.xlsx,.xls,.pdf' : '.pdf,.xlsx,.xls'}
        multiple
        files={[]}
        onAdd={f => { void reconhecer(f) }}
        onRemove={() => {}}
      />

      {(lendo || itens.length > 0) && (
        <ul aria-label="Arquivos reconhecidos" className="flex flex-col gap-2 md:max-w-2xl">
          {itens.map(it => <LinhaArquivo key={it.id} it={it} cliente={cliente} onEscolher={e => escolher(it.id, e)} onRemover={() => remover(it.id)} />)}
          {lendo && (
            <li className="flex items-center gap-2.5 rounded-2xl bg-[var(--color-bg-subtle)] px-4 py-3 text-[13px] text-[var(--color-fg-muted)]">
              <span className="size-4 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-navy-700)]" />
              Lendo os arquivos…
            </li>
          )}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={enviar} disabled={!envio.podeEnviar || enviando || lendo}
          className="inline-flex h-11 items-center rounded-full bg-[var(--color-navy-700)] px-6 text-[14px] font-semibold text-white transition hover:bg-[var(--color-navy-800)] active:scale-[0.98] disabled:opacity-40">
          {enviando ? (rq ? 'Lendo a planilha…' : 'Lendo os PDFs…') : compacto ? 'Enviar' : 'Começar o acompanhamento'}
        </button>
        {envio.falta && !erro && <span className="text-[13px] text-[var(--color-fg-muted)]">{envio.falta}</span>}
        {erro && <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-danger)]"><WarningCircle size={16} weight="fill" />{erro}</span>}
      </div>
      {avisoAdmin && <p className="inline-flex items-start gap-1.5 text-[12px] leading-relaxed text-[var(--color-fg-muted)]"><Info size={14} className="mt-0.5 shrink-0 text-[var(--color-navy-700)]" />{avisoAdmin}</p>}
    </div>
  )
}

function LinhaArquivo({ it, cliente, onEscolher, onRemover }: { it: ItemArquivo; cliente: ClienteTela; onEscolher: (e: EscolhaCliente) => void; onRemover: () => void }) {
  const info = it.info
  const desconhecido = !info || info.tipo === 'desconhecido'
  const Icone = desconhecido ? Question : info.serve ? CheckCircle : Info
  return (
    <li className="flex items-start gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-3">
      <Icone size={18} weight={info?.serve ? 'fill' : 'bold'} className="mt-0.5 shrink-0 text-[var(--color-navy-700)]" />
      <div className="min-w-0 flex-1">
        {desconhecido ? (
          <>
            <p className="text-[13.5px] font-semibold text-[var(--color-fg)]">Não reconheci “{it.file.name}” — é de qual cliente?</p>
            {it.escolha ? (
              <p className="mt-1 text-[13px] text-[var(--color-fg-muted)]">{respostaArquivoDesconhecido(it.escolha, cliente)}</p>
            ) : (
              <div role="radiogroup" aria-label="De qual cliente é?" className="mt-2 flex flex-wrap gap-1.5">
                {ESCOLHAS.map(e => (
                  <button key={e.valor} type="button" role="radio" aria-checked={false} onClick={() => onEscolher(e.valor)}
                    className="inline-flex h-8 items-center rounded-full border border-[var(--color-border)] px-3 text-[12.5px] font-medium text-[var(--color-fg)] transition hover:border-[var(--color-navy-700)]">
                    {e.rotulo}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-[13.5px] font-semibold text-[var(--color-fg)]">{info.serve ? 'Reconheci: ' : ''}{info.resumo}</p>
            <p className="mt-0.5 truncate text-[12px] text-[var(--color-fg-subtle)]">{it.file.name}</p>
            {info.motivo && <p className="mt-1 text-[13px] text-[var(--color-fg-muted)]">{info.motivo}</p>}
            {info.erro && <p className="mt-1 text-[13px] text-[var(--color-fg-muted)]">Reconheci o documento, mas não consegui contar: {info.erro}</p>}
          </>
        )}
      </div>
      <button type="button" onClick={onRemover} aria-label={`Tirar ${it.file.name}`}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--color-fg-subtle)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-fg)]">
        <X size={12} weight="bold" />
      </button>
    </li>
  )
}

/** Recibo do último envio: o que entrou, as divergências (sem bloquear) e o
 *  repasse ao monitoramento. */
export function ReciboEnvio({ envio }: { envio: EnvioRomaneio }) {
  const avisos = envio.recibo?.avisos ?? []
  const mon = envio.monitoramento ?? []
  const monFalhou = mon.some(m => !m.ok)
  return (
    <section aria-label="Recibo do envio" className="flex flex-col gap-2 rounded-2xl bg-[var(--color-bg-subtle)] px-4 py-3 text-[13px] text-[var(--color-fg-muted)]">
      <p className="inline-flex items-start gap-2 font-semibold text-[var(--color-fg)]">
        <CheckCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-[var(--color-navy-700)]" />
        Recebido: {envio.nfs.toLocaleString('pt-BR')} notas em {envio.placas} placas.
      </p>
      {envio.arquivos && envio.arquivos.length > 0 && (
        <ul className="ml-6 list-disc">{envio.arquivos.map(a => <li key={a}>{a}</li>)}</ul>
      )}
      {avisos.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="inline-flex items-center gap-2 font-semibold text-[var(--color-fg)]"><WarningCircle size={16} className="shrink-0 text-[var(--color-navy-700)]" />Para conferir (o acompanhamento já começou):</p>
          <ul className="ml-6 list-disc">{avisos.map(a => <li key={a.texto}>{a.texto}</li>)}</ul>
        </div>
      )}
      {mon.length > 0 && (
        <p className={monFalhou ? 'text-[var(--color-warning-soft-fg)]' : ''}>
          {mon.map(m => (m.ok
            ? `${m.origem === 'romaneio' ? 'Romaneio' : 'Pão'} enviado também ao Monitoramento${m.linhas != null ? ` (${m.linhas} linhas)` : ''}.`
            : `${m.origem === 'romaneio' ? 'Romaneio' : 'Pão'} não foi pro Monitoramento: ${m.erro}. Suba lá em Configurar Romaneio.`)).join(' ')}
        </p>
      )}
    </section>
  )
}
