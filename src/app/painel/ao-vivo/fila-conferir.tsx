'use client'

// F3-03 (ACH-02, KN-11, KRQ-10): fila "Conferir" do Ao vivo. Uma pergunta só:
// "o que conferir agora?". A ordem vem do GPS (onde o carro esteve primeiro);
// cada nota mostra o motivo do KPI, a parada mais perto e o mapa da entrega.
// A operação registra a conferência (com comprovante quando é entrega, D-07);
// a taxa oficial (GPS) não muda e a "após conferência" fica ao lado (D-06).
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ListChecks, CaretDown, MapTrifold, Paperclip, DownloadSimple, ArrowsLeftRight } from '@phosphor-icons/react/dist/ssr'
import type { PlacaAoVivo } from '@/lib/kpi-romaneio/ao-vivo'
import type { ResultadoAoVivo } from '@/lib/kpi-romaneio/ao-vivo-servico'
import {
  montarFilaConferir, taxaAposConferencia, ACOES_CONFERENCIA, rotuloResolucao,
  type AcaoConferencia, type ItemFila, type ResolucaoTela,
} from '@/lib/kpi-romaneio/fila-conferir'
import { validarComprovante, ACCEPT_COMPROVANTE } from '@/lib/kpi-romaneio/comprovante'
import { montarPlanilhaConferencia } from '@/lib/kpi-romaneio/planilha-conferencia'
import { faltamParaMeta } from '@/lib/kpi/metas'
import { buscarComSessao, lerJson } from '@/lib/sessao-fetch'
import { linkMonitoramento, mostraVerNoMonitoramento, enderecoLimpo, srcMiniMapa } from './link-monitoramento'

type Cliente = 'nutrimax' | 'rioquality'
const PASSO = 15
const fmtPct = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ' às')

export function FilaConferir({ cliente, nomeCliente, data, historico, placas, resumo, meta, onTrocarCarga }: {
  cliente: Cliente
  nomeCliente: string
  data: string
  historico: boolean
  placas: PlacaAoVivo[]
  resumo: ResultadoAoVivo['resumo']
  meta: number
  /** Nutry: abre "Trocar carga entre placas" (Entregue por outra placa). */
  onTrocarCarga?: () => void
}) {
  const [resolucoes, setResolucoes] = useState<ResolucaoTela[]>([])
  const [erroLeitura, setErroLeitura] = useState<string | null>(null)
  const [aberta, setAberta] = useState<string | null>(null)
  const [mostrar, setMostrar] = useState(PASSO)
  const [verConferidas, setVerConferidas] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      const r = await buscarComSessao(`/api/kpi/resolucao?cliente=${cliente}&data=${data}`, { cache: 'no-store' })
      if (!r.ok) throw new Error(await r.text())
      const j = await lerJson<{ resolucoes: ResolucaoTela[] }>(r)
      setResolucoes(j.resolucoes)
      setErroLeitura(null)
    } catch {
      setErroLeitura('Não consegui ler as conferências gravadas deste dia. A fila mostra todas as notas.')
    }
  }, [cliente, data])
  // Troca de cliente/dia remonta o componente (key no Ao vivo): estado limpo.
  useEffect(() => { void carregar() }, [carregar])

  const fila = useMemo(() => montarFilaConferir(placas, resolucoes), [placas, resolucoes])
  const apos = useMemo(() => taxaAposConferencia(placas, resolucoes), [placas, resolucoes])
  if (fila.pendentes.length === 0 && fila.conferidas.length === 0) return null

  const faltam = faltamParaMeta(meta, (resumo.nfsNaConta ?? 0) + (resumo.aguardando ?? 0), resumo.entregues ?? 0)
  const faltamApos = faltamParaMeta(meta, apos.naConta + (resumo.aguardando ?? 0), apos.confirmadas)
  const chave = (i: ItemFila) => `${i.placa}::${i.nf.carga}::${i.nf.nf}`

  async function baixarPlanilha() {
    const { default: ExcelJS } = await import('exceljs')
    const wb = montarPlanilhaConferencia(ExcelJS, {
      nomeCliente, data, itens: [...fila.pendentes, ...fila.conferidas],
      taxaOficial: { taxa: resumo.taxa, confirmadas: resumo.entregues, naConta: resumo.nfsNaConta }, taxaApos: apos,
    })
    const buf = await wb.xlsx.writeBuffer()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    a.download = `Conferencia-${nomeCliente.replace(/\s+/g, '-')}-${data}.xlsx`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  function gravada(r: ResolucaoTela) {
    const novas = [...resolucoes.filter(x => x.nf !== r.nf), r]
    setResolucoes(novas)
    setAberta(null)
    const t = taxaAposConferencia(placas, novas)
    setAviso(`NF ${r.nf} gravada: ${rotuloResolucao(r)}. A taxa oficial não muda${t.taxa != null ? `; após conferência: ${fmtPct(t.taxa)}%` : ''}.`)
  }

  const lista = verConferidas ? fila.conferidas : fila.pendentes
  return (
    <details className="group rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-[13px] text-[var(--color-fg-muted)] [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2 font-semibold text-[var(--color-fg)]">
          <ListChecks size={16} weight="bold" />Conferir: {fila.pendentes.length === 1 ? '1 nota' : `${fila.pendentes.length.toLocaleString('pt-BR')} notas`} não entregues que pesam na taxa
        </span>
        <span>
          {faltam > 0 ? `faltam ${faltam.toLocaleString('pt-BR')} para a meta de ${meta}%` : `meta de ${meta}% batida`}
          {apos.conferidas > 0 && apos.taxa != null ? ` · após conferência ${fmtPct(apos.taxa)}% (${apos.conferidas} ${apos.conferidas === 1 ? 'conferida' : 'conferidas'})` : ''}
        </span>
        <CaretDown size={13} className="ml-auto shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-3 border-t border-[var(--color-border)] px-4 py-4">
        <p className="text-[12.5px] leading-relaxed text-[var(--color-fg-muted)]">
          Comece pelo topo: o carro esteve no cliente ou perto. Cada nota comprovada conta 1 na taxa após conferência; a taxa oficial é a do GPS
          {resumo.taxa != null ? ` (${fmtPct(resumo.taxa)}%)` : ''} e não muda.
          {apos.conferidas > 0 && apos.taxa != null && <> Após conferência: <strong className="font-semibold text-[var(--color-fg)]">{fmtPct(apos.taxa)}%</strong> ({apos.confirmadas.toLocaleString('pt-BR')} de {apos.naConta.toLocaleString('pt-BR')}){faltamApos > 0 ? `, faltam ${faltamApos}` : ', meta batida'}.</>}
        </p>
        {erroLeitura && <p className="text-[12.5px] text-[var(--color-danger)]">{erroLeitura}</p>}
        {aviso && <p role="status" className="rounded-xl bg-[var(--color-bg-subtle)] px-3.5 py-2 text-[12.5px] text-[var(--color-fg)]">{aviso}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Notas da fila" className="flex flex-wrap gap-1.5">
            {([[false, `A conferir (${fila.pendentes.length})`], [true, `Conferidas (${fila.conferidas.length})`]] as const).map(([v, rotulo]) => (
              <button key={String(v)} type="button" role="radio" aria-checked={verConferidas === v} onClick={() => { setVerConferidas(v); setAberta(null); setMostrar(PASSO) }}
                className={`h-7 rounded-full px-3 text-[12px] font-semibold transition-colors ${verConferidas === v ? 'bg-[var(--color-navy-700)] text-white' : 'bg-[var(--color-bg-subtle)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'}`}>
                {rotulo}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => void baixarPlanilha()} className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-white px-3.5 text-[12.5px] font-semibold text-[var(--color-fg)] transition hover:border-[var(--color-border-strong)]">
            <DownloadSimple size={14} weight="bold" />Baixar planilha da conferência
          </button>
        </div>
        <ul className="overflow-hidden rounded-xl border border-[var(--color-border)]">
          {lista.slice(0, mostrar).map((i, k) => (
            <ItemDaFila key={chave(i)} item={i} ordem={k + 1} aberto={aberta === chave(i)} onAbrir={() => setAberta(a => (a === chave(i) ? null : chave(i)))}
              cliente={cliente} data={data} historico={historico} onGravada={gravada} onTrocarCarga={onTrocarCarga} />
          ))}
          {lista.length === 0 && <li className="px-4 py-6 text-center text-[13px] text-[var(--color-fg-muted)]">{verConferidas ? 'Nenhuma nota conferida neste dia.' : 'Nenhuma nota para conferir.'}</li>}
        </ul>
        {lista.length > mostrar && (
          <button type="button" onClick={() => setMostrar(m => m + PASSO * 2)} className="self-start text-[12.5px] font-semibold text-[var(--color-navy-700)] hover:underline">
            Mostrar mais ({(lista.length - mostrar).toLocaleString('pt-BR')})
          </button>
        )}
      </div>
    </details>
  )
}

function ItemDaFila({ item, ordem, aberto, onAbrir, cliente, data, historico, onGravada, onTrocarCarga }: {
  item: ItemFila; ordem: number; aberto: boolean; onAbrir: () => void
  cliente: Cliente; data: string; historico: boolean
  onGravada: (r: ResolucaoTela) => void; onTrocarCarga?: () => void
}) {
  const n = item.nf
  const r = item.resolucao
  return (
    <li className="border-b border-[var(--color-border)] last:border-b-0">
      <button type="button" onClick={onAbrir} aria-expanded={aberto}
        className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-[var(--color-navy-700)] ${aberto ? 'bg-[var(--color-bg-subtle)]' : 'hover:bg-[var(--color-bg-subtle)]'}`}>
        <span className="w-6 shrink-0 text-right text-[12px] tabular-nums text-[var(--color-fg-subtle)]">{ordem}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-[var(--color-fg)]">{n.cliente || 'Cliente sem nome'}</span>
          <span className="block truncate text-[12px] tabular-nums text-[var(--color-fg-muted)]">NF {n.nf} · {item.placa}{item.titulo ? ` · ${item.titulo}` : ''}</span>
        </span>
        <span className="hidden shrink-0 text-[12px] font-semibold text-[var(--color-fg-muted)] sm:inline">{r ? rotuloResolucao(r) : item.nf.investigacao?.distM != null ? `${item.nf.investigacao.distM.toLocaleString('pt-BR')} m` : ''}</span>
        <CaretDown size={13} className={`shrink-0 text-[var(--color-fg-subtle)] transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>
      {aberto && (
        <div className="flex flex-col gap-3 px-4 pb-4 pl-[52px] text-[13px]">
          <div className="rounded-xl bg-[var(--color-bg-subtle)] px-3.5 py-2.5 text-[var(--color-fg)]">
            <p className="font-semibold leading-snug">Motivo do KPI: {item.motivo.motivo}</p>
            {item.frase && <p className="mt-0.5 text-[12.5px] text-[var(--color-fg-muted)]">GPS: {item.frase}</p>}
          </div>
          <p className="leading-relaxed text-[var(--color-fg-muted)]">NF {n.nf}, carga {n.carga}. {enderecoLimpo(n.endereco)}</p>
          {mostraVerNoMonitoramento(item.placa) && <MiniMapa link={linkMonitoramento(n, item.daPlaca, item.placa, data, historico, cliente)} />}
          {r && (
            <p className="rounded-xl border border-[var(--color-border)] px-3.5 py-2.5 leading-relaxed text-[var(--color-fg)]">
              <strong className="font-semibold">{rotuloResolucao(r)}</strong> — conferida por {r.responsavel} em {quando(r.criadoEm)}.{r.observacao ? ` ${r.observacao}` : ''}
              {r.temComprovante && (
                <a href={`/api/kpi/resolucao/comprovante?cliente=${cliente}&id=${r.id}`} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 font-semibold text-[var(--color-navy-700)] hover:underline">
                  <Paperclip size={13} weight="bold" />Ver comprovante
                </a>
              )}
            </p>
          )}
          <FormConferencia item={item} cliente={cliente} data={data} onGravada={onGravada} onTrocarCarga={onTrocarCarga} mudar={!!r} />
        </div>
      )}
    </li>
  )
}

/** Mapa da entrega (a tela /entrega do monitoramento), só depois de abrir a nota. */
function MiniMapa({ link }: { link: string }) {
  const [src, setSrc] = useState<string | null>(null)
  const [erro, setErro] = useState(false)
  useEffect(() => {
    let vivo = true
    fetch('/api/monitoramento/passe', { cache: 'no-store' })
      .then(r => (r.ok ? (r.json() as Promise<{ passe: string }>) : Promise.reject(new Error(String(r.status)))))
      .then(j => { if (vivo) setSrc(srcMiniMapa(j.passe, link)) })
      .catch(() => { if (vivo) setErro(true) })
    return () => { vivo = false }
  }, [link])
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative h-[280px] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-subtle)]">
        {src && <iframe src={src} title="Mapa da entrega" className="block h-full w-full border-0" loading="lazy" />}
        {!src && !erro && <span className="absolute inset-0 m-auto size-5 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-navy-700)]" />}
        {erro && <p className="absolute inset-0 flex items-center justify-center text-[12.5px] text-[var(--color-fg-muted)]">Mapa indisponível agora.</p>}
      </div>
      <Link href={link} className="inline-flex items-center gap-1.5 self-start text-[12.5px] font-semibold text-[var(--color-navy-700)] hover:underline">
        <MapTrifold size={14} weight="bold" />Abrir o mapa grande
      </Link>
    </div>
  )
}

function FormConferencia({ item, cliente, data, onGravada, onTrocarCarga, mudar }: {
  item: ItemFila; cliente: Cliente; data: string; onGravada: (r: ResolucaoTela) => void; onTrocarCarga?: () => void; mudar: boolean
}) {
  const [aberto, setAberto] = useState(!mudar)
  const [acao, setAcao] = useState<AcaoConferencia | null>(null)
  const [obs, setObs] = useState('')
  const [placa, setPlaca] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const def = ACOES_CONFERENCIA.find(a => a.acao === acao) ?? null

  if (!aberto) {
    return <button type="button" onClick={() => setAberto(true)} className="self-start text-[12.5px] font-semibold text-[var(--color-navy-700)] hover:underline">Mudar a conferência</button>
  }

  async function gravar() {
    if (!def) return
    if (def.exigePlaca && placa.trim().length < 7) { setMsg({ ok: false, texto: 'Informe a placa que fez a entrega.' }); return }
    if (def.exigeComprovante && !arquivo) { setMsg({ ok: false, texto: 'Anexe o canhoto ou a foto da entrega.' }); return }
    if (arquivo) { const v = validarComprovante(arquivo); if (!v.ok) { setMsg({ ok: false, texto: v.erro }); return } }
    const fd = new FormData()
    fd.set('data', data); fd.set('nf', item.nf.nf); fd.set('acao', def.acao)
    if (obs.trim()) fd.set('observacao', obs.trim())
    if (def.exigePlaca) fd.set('placaExecutora', placa.trim())
    if (arquivo) fd.set('comprovante', arquivo)
    setEnviando(true); setMsg(null)
    try {
      const r = await buscarComSessao(`/api/kpi/resolucao?cliente=${cliente}`, { method: 'POST', body: fd })
      if (!r.ok) { setMsg({ ok: false, texto: await r.text() }); return }
      const j = await lerJson<{ resolucao: ResolucaoTela }>(r)
      onGravada(j.resolucao)
    } catch {
      setMsg({ ok: false, texto: 'Não consegui falar com o servidor. Tente de novo.' })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div role="radiogroup" aria-label="Conferência" className="flex flex-wrap gap-1.5">
        {ACOES_CONFERENCIA.map(a => (
          <button key={a.acao} type="button" role="radio" aria-checked={acao === a.acao} onClick={() => { setAcao(a.acao); setMsg(null) }}
            className={`inline-flex h-8 items-center rounded-full px-3 text-[12.5px] font-semibold transition ${acao === a.acao ? 'bg-[var(--color-navy-700)] text-white' : 'border border-[var(--color-border)] bg-white text-[var(--color-fg)] hover:border-[var(--color-border-strong)]'}`}>
            {a.rotulo}
          </button>
        ))}
      </div>
      {def && (
        <>
          <p className="text-[12.5px] text-[var(--color-fg-muted)]">{def.dica}</p>
          {def.acao === 'outra_placa' && cliente === 'nutrimax' && onTrocarCarga && (
            <button type="button" onClick={onTrocarCarga} className="inline-flex items-center gap-1.5 self-start text-[12.5px] font-semibold text-[var(--color-navy-700)] hover:underline">
              <ArrowsLeftRight size={14} weight="bold" />A carga inteira foi com outra placa? Trocar carga entre placas
            </button>
          )}
          <div className="flex flex-wrap items-end gap-3">
            {def.exigePlaca && (
              <label className="flex flex-col gap-1 text-[12px] text-[var(--color-fg-muted)]">Placa que entregou
                <input value={placa} onChange={e => setPlaca(e.target.value)} placeholder="ex.: RQV5F67" maxLength={8} className="h-9 w-[140px] rounded-lg border border-[var(--color-border)] bg-white px-2.5 text-[13px] uppercase text-[var(--color-fg)]" />
              </label>
            )}
            <label className="flex flex-col gap-1 text-[12px] text-[var(--color-fg-muted)]">{def.exigeComprovante ? 'Comprovante (foto ou PDF)' : 'Anexo (opcional)'}
              <input type="file" accept={ACCEPT_COMPROVANTE} onChange={e => setArquivo(e.target.files?.[0] ?? null)} className="max-w-[260px] text-[12.5px] text-[var(--color-fg)] file:mr-2 file:rounded-full file:border-0 file:bg-[var(--color-bg-subtle)] file:px-3 file:py-1.5 file:text-[12px] file:font-semibold" />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-[12px] text-[var(--color-fg-muted)]">Observação (opcional)
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} maxLength={1000} className="rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-2 text-[13px] text-[var(--color-fg)]" />
          </label>
          <button type="button" disabled={enviando} onClick={() => void gravar()}
            className="inline-flex h-9 items-center self-start rounded-full bg-[var(--color-navy-700)] px-4 text-[13px] font-semibold text-white transition hover:bg-[var(--color-navy-800)] disabled:opacity-50">
            {enviando ? 'Gravando…' : 'Gravar conferência'}
          </button>
        </>
      )}
      {msg && <p role={msg.ok ? undefined : 'alert'} className={`text-[12.5px] ${msg.ok ? 'text-[var(--color-fg-muted)]' : 'font-semibold text-[var(--color-danger)]'}`}>{msg.texto}</p>}
    </div>
  )
}
