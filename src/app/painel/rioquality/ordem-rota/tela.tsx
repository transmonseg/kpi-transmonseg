'use client'

// 12/11 (ideia da Érica, pedido da Rio Quality): o motorista seguiu a ordem da
// roteirização? Tela dedicada: período, números do período, por dia, ranking
// de motoristas e placas, cada viagem com a sequência completa, e o relatório
// em planilha. A ordem vem do "Relatório de Entregas das cargas" da Fusion.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowsDownUp, CaretRight, CheckCircle, DownloadSimple, FileXls, MagnifyingGlass, Path, UploadSimple, WarningCircle, X } from '@phosphor-icons/react/dist/ssr'
import { ColumnChart } from '@/app/painel/charts'
import { buscarComSessao, SessaoVencida } from '@/lib/sessao-fetch'
import type { Agregado, Viagem } from '@/lib/kpi-romaneio/relatorio-ordem-rota'
import type { RespostaOrdemRota } from '@/lib/kpi-romaneio/relatorio-ordem-rota-servidor'

type Resposta = RespostaOrdemRota
type Aba = 'motoristas' | 'placas' | 'viagens'
type Atalho = 'hoje' | 'ontem' | '7' | '30' | 'livre'

const META = 70 // abaixo disso a placa/motorista aparece em laranja
const n = (x: number) => x.toLocaleString('pt-BR')
const p1 = (x: number) => `${x.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const brAno = (iso: string) => `${br(iso)}/${iso.slice(0, 4)}`
const menos = (iso: string, dias: number) => new Date(Date.parse(iso + 'T12:00:00Z') - dias * 86_400_000).toISOString().slice(0, 10)
const tom = (pct: number) => (pct < META ? 'text-[var(--color-warning)]' : 'text-[var(--color-fg)]')

export function TelaOrdemRota({ hoje }: { hoje: string }) {
  const [atalho, setAtalho] = useState<Atalho>('hoje')
  const [de, setDe] = useState(hoje)
  const [ate, setAte] = useState(hoje)
  const [r, setR] = useState<Resposta | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [aba, setAba] = useState<Aba>('motoristas')
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<{ tipo: 'motorista' | 'placa'; valor: string } | null>(null)
  const [aberta, setAberta] = useState<Viagem | null>(null)
  const [subindo, setSubindo] = useState(false)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const inputArquivo = useRef<HTMLInputElement>(null)

  const escolher = (a: Atalho) => {
    setAtalho(a)
    setAberta(null)
    if (a === 'hoje') { setDe(hoje); setAte(hoje) }
    if (a === 'ontem') { setDe(menos(hoje, 1)); setAte(menos(hoje, 1)) }
    if (a === '7') { setDe(menos(hoje, 6)); setAte(hoje) }
    if (a === '30') { setDe(menos(hoje, 29)); setAte(hoje) }
  }

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      const resp = await buscarComSessao(`/api/kpi/ordem-rota?de=${de}&ate=${ate}`)
      if (!resp.ok) { setErro(await resp.text()); setR(null); return }
      setR(await resp.json())
    } catch (e) {
      if (!(e instanceof SessaoVencida)) setErro('Sem conexão com o servidor. Tente de novo.')
    } finally {
      setCarregando(false)
    }
  }, [de, ate])

  useEffect(() => { void carregar() }, [carregar])

  async function subir(file: File) {
    setSubindo(true)
    setAviso(null)
    const fd = new FormData()
    fd.set('arquivo', file)
    try {
      const resp = await buscarComSessao('/api/kpi/ordem-rota', { method: 'POST', body: fd })
      if (!resp.ok) { setAviso({ ok: false, texto: await resp.text() }); return }
      const j = (await resp.json()) as { nfs: number; placas: number; dias: string[] }
      setAviso({ ok: true, texto: `Ordem guardada: ${n(j.nfs)} notas de ${j.placas} placas (${j.dias.map(br).join(', ')}).` })
      void carregar()
    } catch (e) {
      if (!(e instanceof SessaoVencida)) setAviso({ ok: false, texto: 'Sem conexão com o servidor. Tente de novo.' })
    } finally {
      setSubindo(false)
      if (inputArquivo.current) inputArquivo.current.value = ''
    }
  }

  const viagens = useMemo(() => {
    if (!r) return []
    const q = busca.trim().toUpperCase()
    return r.viagens.filter(v =>
      (!filtro || (filtro.tipo === 'motorista' ? v.motorista === filtro.valor : v.placa === filtro.valor)) &&
      (!q || v.placa.includes(q.replace(/[^A-Z0-9]/g, '')) || v.motorista.toUpperCase().includes(q) || v.destino.toUpperCase().includes(q)))
  }, [r, busca, filtro])

  const agregados = useMemo(() => {
    if (!r) return []
    const q = busca.trim().toUpperCase()
    const lista = aba === 'placas' ? r.placas : r.motoristas
    return lista.filter(a => !q || a.nome.toUpperCase().includes(q) || a.sub.toUpperCase().includes(q))
  }, [r, aba, busca])

  const verViagens = (tipo: 'motorista' | 'placa', valor: string) => { setFiltro({ tipo, valor }); setAba('viagens'); setBusca('') }
  const periodo = de === ate ? brAno(de) : `${brAno(de)} a ${brAno(ate)}`
  const vazio = !carregando && r && r.total.viagens === 0

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6">
      <header className="flex flex-col gap-1.5">
        <span className="text-overline">Rio Quality · Roteirização</span>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-display text-[34px] leading-none text-[var(--color-fg)] md:text-[40px]">Ordem da rota</h1>
          <div className="flex flex-wrap items-center gap-2">
            <a href={`/api/kpi/ordem-rota?de=${de}&ate=${ate}&formato=xlsx`} aria-disabled={!r || r.total.viagens === 0}
              className={`inline-flex h-10 items-center gap-2 rounded-full bg-[var(--color-navy-700)] px-4 text-[13px] font-semibold text-white transition hover:bg-[var(--color-navy-800)] ${!r || r.total.viagens === 0 ? 'pointer-events-none opacity-40' : ''}`}>
              <DownloadSimple size={16} weight="bold" />Baixar relatório (Excel)
            </a>
          </div>
        </div>
        <p className="mt-1 max-w-[78ch] text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
          Compara a ordem planejada na roteirização com a ordem em que o caminhão chegou em cada cliente (GPS). Em cada viagem, a maior sequência que respeita o plano conta como <strong className="text-[var(--color-fg)]">na ordem</strong>; as outras entregas foram feitas fora da ordem: o motorista pulou o cliente e voltou depois, ou inverteu a rota.
        </p>
      </header>

      <AreaSubir subindo={subindo} aviso={aviso} envios={r?.envios ?? []} periodo={periodo} inputRef={inputArquivo} onArquivo={f => void subir(f)} />

      {/* Período */}
      <div className="dash-card flex flex-wrap items-center gap-3 px-4 py-3">
        <div role="radiogroup" aria-label="Período" className="inline-flex flex-wrap rounded-full bg-[var(--color-bg-subtle)] p-0.5">
          {([['hoje', 'Hoje'], ['ontem', 'Ontem'], ['7', '7 dias'], ['30', '30 dias'], ['livre', 'Escolher datas']] as const).map(([v, rot]) => (
            <button key={v} type="button" role="radio" aria-checked={atalho === v} onClick={() => escolher(v)}
              className={`h-8 rounded-full px-3.5 text-[12.5px] font-semibold transition-colors ${atalho === v ? 'bg-[var(--color-bg-elevated)] text-[var(--color-fg)] shadow-sm' : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'}`}>{rot}</button>
          ))}
        </div>
        {atalho === 'livre' && (
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-[var(--color-fg-muted)]">
            <input type="date" value={de} max={ate} onChange={e => { if (e.target.value) { setDe(e.target.value); setAberta(null) } }} className="h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-[13px] text-[var(--color-fg)]" aria-label="De" />
            até
            <input type="date" value={ate} min={de} max={hoje} onChange={e => { if (e.target.value) { setAte(e.target.value); setAberta(null) } }} className="h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-[13px] text-[var(--color-fg)]" aria-label="Até" />
          </div>
        )}
        <span className="ml-auto text-[12.5px] text-[var(--color-fg-muted)]">{carregando ? 'Carregando…' : periodo}</span>
      </div>

      {erro && <p role="alert" className="rounded-xl bg-[var(--color-danger-soft)] px-4 py-3 text-[13px] font-semibold text-[var(--color-danger)]">{erro}</p>}

      {vazio && (
        <div className="dash-card flex flex-col items-center gap-3 px-6 py-14 text-center">
          <Path size={30} weight="bold" className="text-[var(--color-fg-subtle)]" />
          <p className="text-[15px] font-semibold text-[var(--color-fg)]">Sem ordem da rota em {periodo}</p>
          <p className="max-w-[60ch] text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
            Solte o <strong>Relatório de Entregas das cargas</strong> da Fusion (o que tem a coluna ORDEM) na área acima. Pode ser enviado a qualquer hora; vale também para dias anteriores.
          </p>
          {r && r.semCalculo.length > 0 && <p className="text-[12px] text-[var(--color-fg-subtle)]">Dias com ordem mas sem cálculo do KPI: {r.semCalculo.map(br).join(', ')}.</p>}
        </div>
      )}

      {r && r.total.viagens > 0 && (
        <>
          {/* Números do período */}
          <section aria-label="Resumo do período" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="dash-card flex flex-col gap-3 p-5 sm:col-span-2 lg:col-span-1">
              <span className="text-[12px] font-medium text-[var(--color-fg-muted)]">Entregas na ordem planejada</span>
              <span className={`text-[40px] font-semibold leading-none tracking-[-0.02em] tabular-nums ${tom(r.total.pct)}`}>{p1(r.total.pct)}</span>
              <span className="block h-1.5 overflow-hidden rounded-full bg-[var(--color-border)]">
                <span className="block h-full rounded-full" style={{ width: `${r.total.pct}%`, background: r.total.pct < META ? 'var(--color-warning)' : 'var(--color-success)' }} />
              </span>
              <span className="text-[12.5px] tabular-nums text-[var(--color-fg-muted)]">{n(r.total.naOrdem)} de {n(r.total.entregas)} entregas</span>
            </div>
            <Numero rotulo="Viagens analisadas" valor={n(r.total.viagens)} extra={`${n(r.motoristas.length)} motoristas, ${n(r.placas.length)} placas`} />
            <Numero rotulo="Rotas de trás pra frente" valor={n(r.total.invertidas)} extra={r.total.invertidas ? 'Começaram pelo último cliente do plano' : 'Nenhuma viagem invertida'} alerta={r.total.invertidas > 0} />
            <Numero rotulo="Fora da ordem" valor={n(r.total.entregas - r.total.naOrdem)} extra="Entregas feitas antes ou depois do planejado" alerta={r.total.entregas - r.total.naOrdem > 0} />
          </section>

          {r.dias.length > 1 && (
            <section className="dash-card flex flex-col gap-3 p-5">
              <h2 className="text-[14px] font-semibold text-[var(--color-fg)]">% na ordem por dia</h2>
              <ColumnChart items={r.dias.map(d => ({ label: br(d.data), value: d.pct }))} format={p1} height={200} labelEvery={r.dias.length > 16 ? 2 : 1} />
            </section>
          )}

          {/* Ranking + viagens */}
          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
            <div className="dash-card flex min-w-0 flex-col overflow-hidden">
              <div className="flex flex-wrap items-center gap-3 border-b border-[var(--color-border)] px-4 py-3">
                <div role="tablist" aria-label="Ver por" className="inline-flex rounded-full bg-[var(--color-bg-subtle)] p-0.5">
                  {([['motoristas', 'Motoristas'], ['placas', 'Placas'], ['viagens', 'Viagens']] as const).map(([v, rot]) => (
                    <button key={v} type="button" role="tab" aria-selected={aba === v} onClick={() => { setAba(v); if (v !== 'viagens') setFiltro(null) }}
                      className={`h-7 rounded-full px-3 text-[12px] font-semibold transition-colors ${aba === v ? 'bg-[var(--color-bg-elevated)] text-[var(--color-fg)] shadow-sm' : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'}`}>{rot}</button>
                  ))}
                </div>
                <label className="relative ml-auto min-w-[160px] flex-1 sm:max-w-[220px]">
                  <MagnifyingGlass size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-fg-subtle)]" />
                  <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Placa, motorista…" aria-label="Buscar"
                    className="h-8 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] pl-8 pr-3 text-[12.5px] text-[var(--color-fg)]" />
                </label>
              </div>
              {aba === 'viagens' && filtro && (
                <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-4 py-2 text-[12.5px] text-[var(--color-fg)]">
                  Viagens {filtro.tipo === 'motorista' ? 'de' : 'da placa'} <strong>{filtro.valor}</strong>
                  <button type="button" onClick={() => setFiltro(null)} className="ml-auto inline-flex items-center gap-1 font-semibold text-[var(--color-navy-700)]"><X size={12} weight="bold" />Ver todas</button>
                </div>
              )}
              <div className="max-h-[560px] overflow-y-auto">
                {aba !== 'viagens' ? (
                  <ListaAgregado itens={agregados} tipo={aba === 'placas' ? 'placa' : 'motorista'} onVer={verViagens} />
                ) : (
                  <ListaViagens itens={viagens} aberta={aberta} onAbrir={setAberta} varios={r.dias.length > 1} />
                )}
              </div>
              <p className="flex items-center gap-1.5 border-t border-[var(--color-border)] px-4 py-2 text-[11.5px] text-[var(--color-fg-subtle)]"><ArrowsDownUp size={12} />Pior primeiro. Abaixo de {META}% fica em laranja.</p>
            </div>

            <DetalheViagem v={aberta} onFechar={() => setAberta(null)} temViagens={viagens.length > 0} onPrimeira={() => { setAba('viagens'); setAberta(viagens[0] ?? r.viagens[0]) }} />
          </section>
          {r.semCalculo.length > 0 && <p className="text-[12px] text-[var(--color-fg-subtle)]">Dias com ordem guardada mas sem cálculo do KPI (ficaram de fora): {r.semCalculo.map(br).join(', ')}.</p>}
        </>
      )}
    </div>
  )
}

/** Espaço de subir o relatório da Fusion: arrastar ou escolher, envia na hora;
 *  ao lado, o que já entrou em cada dia do período (quando e por quem). */
function AreaSubir({ subindo, aviso, envios, periodo, inputRef, onArquivo }: {
  subindo: boolean; aviso: { ok: boolean; texto: string } | null; envios: Resposta['envios']; periodo: string
  inputRef: React.RefObject<HTMLInputElement | null>; onArquivo: (f: File) => void
}) {
  const [arrastando, setArrastando] = useState(false)
  const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  return (
    <section aria-label="Subir relatório da Fusion" className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="dash-card min-w-0 p-2">
      <div
        role="button" tabIndex={0} aria-disabled={subindo}
        onClick={() => !subindo && inputRef.current?.click()}
        onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !subindo) { e.preventDefault(); inputRef.current?.click() } }}
        onDragOver={e => { e.preventDefault(); setArrastando(true) }}
        onDragLeave={() => setArrastando(false)}
        onDrop={e => { e.preventDefault(); setArrastando(false); const f = e.dataTransfer.files?.[0]; if (f && !subindo) onArquivo(f) }}
        className={`flex h-full min-h-[150px] cursor-pointer flex-col justify-between gap-4 rounded-[14px] border-2 border-dashed p-4 transition-colors focus-visible:outline-2 focus-visible:outline-[var(--color-navy-700)] ${arrastando ? 'border-[var(--color-navy-700)] bg-[var(--color-bg-subtle)]' : 'border-[var(--color-border-strong)] hover:border-[var(--color-navy-700)] hover:bg-[var(--color-bg-subtle)]'} ${subindo ? 'cursor-wait opacity-70' : ''}`}>
        <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onArquivo(f) }} />
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--color-bg-subtle)] text-[var(--color-navy-700)]"><UploadSimple size={20} weight="bold" /></span>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-[var(--color-fg)]">{subindo ? 'Guardando a ordem da rota…' : arrastando ? 'Solte o arquivo aqui' : 'Subir o relatório da Fusion'}</p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-[var(--color-fg-muted)]">Arraste aqui ou clique para escolher o <strong className="text-[var(--color-fg)]">Relatório de Entregas das cargas</strong> (xlsx, com a coluna ORDEM). Entra na hora; reenviar o mesmo dia substitui o anterior.</p>
          </div>
        </div>
        {aviso ? (
          <p role={aviso.ok ? 'status' : 'alert'} className={`inline-flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-[13px] ${aviso.ok ? 'bg-[var(--color-success-soft)] font-semibold text-[var(--color-success)]' : 'bg-[var(--color-danger-soft)] font-semibold text-[var(--color-danger)]'}`}>
            {aviso.ok ? <CheckCircle size={16} weight="fill" className="mt-0.5 shrink-0" /> : <WarningCircle size={16} className="mt-0.5 shrink-0" />}{aviso.texto}
          </p>
        ) : (
          <p className="inline-flex items-center gap-2 text-[12px] text-[var(--color-fg-subtle)]"><FileXls size={15} className="shrink-0" />É a planilha com os blocos CARGA / ENTREGAS DETALHADAS e as colunas ID ROMANEIO e ORDEM.</p>
        )}
      </div>
      </div>
      <div className="dash-card flex min-w-0 flex-col gap-2 p-5">
        <p className="text-[13px] font-semibold text-[var(--color-fg)]">Enviados · {periodo}</p>
        {envios.length === 0 ? (
          <p className="text-[12.5px] leading-relaxed text-[var(--color-fg-muted)]">Nenhum relatório de ordem neste período ainda.</p>
        ) : (
          <ul className="flex max-h-[150px] flex-col divide-y divide-[var(--color-border)] overflow-y-auto text-[12.5px]">
            {[...envios].reverse().map(e => (
              <li key={e.data} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5">
                <CheckCircle size={14} weight="fill" className="shrink-0 text-[var(--color-success)]" />
                <span className="w-11 shrink-0 font-semibold tabular-nums text-[var(--color-fg)]">{br(e.data)}</span>
                <span className="shrink-0 tabular-nums text-[var(--color-fg-muted)]">{n(e.nfs)} notas, {e.placas} placas</span>
                <span className="ml-auto min-w-0 truncate text-right text-[var(--color-fg-subtle)]">{e.enviadoPor ?? '—'} · {quando(e.enviadoEm)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function Numero({ rotulo, valor, extra, alerta }: { rotulo: string; valor: string; extra: string; alerta?: boolean }) {
  return (
    <div className="dash-card flex flex-col gap-2 p-5">
      <span className="text-[12px] font-medium text-[var(--color-fg-muted)]">{rotulo}</span>
      <span className={`text-[28px] font-semibold leading-none tracking-[-0.02em] tabular-nums ${alerta ? 'text-[var(--color-warning)]' : 'text-[var(--color-fg)]'}`}>{valor}</span>
      <span className="text-[12px] leading-snug text-[var(--color-fg-muted)]">{extra}</span>
    </div>
  )
}

function Barra({ pct }: { pct: number }) {
  return (
    <span className="block h-1 w-full overflow-hidden rounded-full bg-[var(--color-border)]">
      <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: pct < META ? 'var(--color-warning)' : 'var(--color-navy-700)' }} />
    </span>
  )
}

function ListaAgregado({ itens, tipo, onVer }: { itens: Agregado[]; tipo: 'motorista' | 'placa'; onVer: (t: 'motorista' | 'placa', v: string) => void }) {
  if (itens.length === 0) return <p className="px-4 py-10 text-center text-[13px] text-[var(--color-fg-muted)]">Nada encontrado.</p>
  return (
    <ul>
      {itens.map(a => (
        <li key={a.chave}>
          <button type="button" onClick={() => onVer(tipo, a.chave)} className="flex w-full items-center gap-3 border-b border-[var(--color-border)] px-4 py-3 text-left transition-colors hover:bg-[var(--color-bg-subtle)]">
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="flex items-baseline justify-between gap-3">
                <span className="truncate text-[13.5px] font-semibold text-[var(--color-fg)]">{a.nome}</span>
                <span className={`shrink-0 text-[14px] font-semibold tabular-nums ${tom(a.pct)}`}>{p1(a.pct)}</span>
              </span>
              <Barra pct={a.pct} />
              <span className="flex items-center justify-between gap-3 text-[11.5px] text-[var(--color-fg-muted)]">
                <span className="truncate">{a.sub}</span>
                <span className="shrink-0 tabular-nums">{n(a.naOrdem)}/{n(a.entregas)} · {a.viagens} {a.viagens === 1 ? 'viagem' : 'viagens'}{a.invertidas ? ` · ${a.invertidas} de trás pra frente` : ''}</span>
              </span>
            </span>
            <CaretRight size={13} className="shrink-0 text-[var(--color-fg-subtle)]" />
          </button>
        </li>
      ))}
    </ul>
  )
}

function ListaViagens({ itens, aberta, onAbrir, varios }: { itens: Viagem[]; aberta: Viagem | null; onAbrir: (v: Viagem) => void; varios: boolean }) {
  if (itens.length === 0) return <p className="px-4 py-10 text-center text-[13px] text-[var(--color-fg-muted)]">Nenhuma viagem encontrada.</p>
  return (
    <ul>
      {itens.map(v => {
        const ativa = aberta?.romaneio === v.romaneio && aberta.data === v.data
        return (
          <li key={`${v.data}-${v.romaneio}`}>
            <button type="button" onClick={() => onAbrir(v)} aria-current={ativa ? 'true' : undefined}
              className={`flex w-full items-center gap-3 border-b border-[var(--color-border)] px-4 py-3 text-left transition-colors ${ativa ? 'bg-[var(--color-bg-subtle)] shadow-[inset_3px_0_0_var(--color-navy-700)]' : 'hover:bg-[var(--color-bg-subtle)]'}`}>
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-[13.5px] font-semibold text-[var(--color-fg)]">{v.placa}{varios && <span className="ml-2 text-[11.5px] font-medium text-[var(--color-fg-subtle)]">{br(v.data)}</span>}</span>
                  <span className={`shrink-0 text-[14px] font-semibold tabular-nums ${tom(v.pct)}`}>{v.naOrdem}/{v.entregas}</span>
                </span>
                <Fita v={v} />
                <span className="flex items-center justify-between gap-3 text-[11.5px] text-[var(--color-fg-muted)]">
                  <span className="truncate">{v.motorista} · {v.destino}</span>
                  {v.invertida && <span className="shrink-0 rounded-full bg-[var(--color-warning-soft)] px-2 py-0.5 font-semibold text-[var(--color-warning)]">de trás pra frente</span>}
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** A viagem numa fita: um traço por entrega, na ordem em que aconteceu;
 *  laranja = fora da ordem planejada. */
function Fita({ v }: { v: Viagem }) {
  return (
    <span className="flex h-1.5 w-full gap-px overflow-hidden rounded-full" aria-hidden>
      {v.sequencia.map(s => <span key={s.real} className="h-full flex-1" style={{ background: s.naOrdem ? 'var(--color-navy-700)' : 'var(--color-warning)' }} />)}
    </span>
  )
}

function DetalheViagem({ v, onFechar, temViagens, onPrimeira }: { v: Viagem | null; onFechar: () => void; temViagens: boolean; onPrimeira: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  // Celular: o detalhe fica embaixo da lista -- leva até ele ao abrir.
  useEffect(() => {
    if (v && window.innerWidth < 1024) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [v])
  if (!v) {
    return (
      <div className="dash-card flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
        <Path size={28} weight="bold" className="text-[var(--color-fg-subtle)]" />
        <p className="max-w-[40ch] text-[13px] leading-relaxed text-[var(--color-fg-muted)]">Escolha uma viagem para ver a sequência completa: a ordem planejada e a ordem em que o caminhão chegou em cada cliente.</p>
        {temViagens && <button type="button" onClick={onPrimeira} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--color-border-strong)] px-4 text-[13px] font-semibold text-[var(--color-fg)] transition hover:bg-[var(--color-bg-subtle)]">Abrir a pior viagem<CaretRight size={13} weight="bold" /></button>}
      </div>
    )
  }
  const fora = v.sequencia.filter(s => !s.naOrdem).length
  return (
    <div ref={ref} className="dash-card flex min-w-0 scroll-mt-20 flex-col overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[var(--color-border)] p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[20px] font-semibold tracking-[-0.01em] text-[var(--color-fg)]">{v.placa}</h3>
            <p className="truncate text-[12.5px] text-[var(--color-fg-muted)]">{v.motorista} · {v.destino} · romaneio {v.romaneio} · {brAno(v.data)}</p>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="rounded-full p-1.5 text-[var(--color-fg-subtle)] hover:bg-[var(--color-bg-subtle)]"><X size={14} weight="bold" /></button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Mini rotulo="Na ordem" valor={`${v.naOrdem} de ${v.entregas}`} destaque={v.pct < META} />
          <Mini rotulo="Fora da ordem" valor={String(fora)} destaque={fora > 0} />
          <Mini rotulo="% na ordem" valor={p1(v.pct)} destaque={v.pct < META} />
        </div>
        {v.invertida && <p className="rounded-xl bg-[var(--color-warning-soft)] px-3.5 py-2.5 text-[12.5px] font-semibold text-[var(--color-warning)]">Fez a rota de trás pra frente: começou pelo último cliente da roteirização.</p>}
        {v.naoFeitas > 0 && <p className="text-[12px] text-[var(--color-fg-muted)]">{v.naoFeitas} {v.naoFeitas === 1 ? 'entrega planejada ainda não foi feita (ou não foi entregue)' : 'entregas planejadas ainda não foram feitas (ou não foram entregues)'} e não entram na conta.</p>}
      </div>
      <div className="max-h-[470px] overflow-auto">
        <table className="w-full text-[12.5px]">
          <thead className="sticky top-0 bg-[var(--color-bg-elevated)]">
            <tr className="text-left text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">
              <th className="px-4 py-2.5">Feita</th><th className="px-2 py-2.5">Era a</th><th className="px-2 py-2.5">Cliente</th>
              <th className="px-4 py-2.5 text-right">Chegou (GPS)</th>
            </tr>
          </thead>
          <tbody>
            {v.sequencia.map(s => (
              <tr key={s.real} className={`border-t border-[var(--color-border)] ${s.naOrdem ? '' : 'bg-[var(--color-warning-soft)]'}`}>
                <td className="px-4 py-2 tabular-nums font-semibold text-[var(--color-fg)]">{s.real}ª</td>
                <td className={`px-2 py-2 tabular-nums ${s.naOrdem ? 'text-[var(--color-fg-muted)]' : 'font-semibold text-[var(--color-warning)]'}`}>{s.planejada}ª</td>
                <td className="max-w-[220px] truncate px-2 py-2 text-[var(--color-fg)]" title={`NF ${s.nf}`}>{s.cliente || `NF ${s.nf}`}</td>
                <td className="px-4 py-2 text-right tabular-nums text-[var(--color-fg)]">{s.chegada ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Mini({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="rounded-xl bg-[var(--color-bg-subtle)] px-3 py-2">
      <p className="text-[11px] text-[var(--color-fg-muted)]">{rotulo}</p>
      <p className={`text-[15px] font-semibold tabular-nums ${destaque ? 'text-[var(--color-warning)]' : 'text-[var(--color-fg)]'}`}>{valor}</p>
    </div>
  )
}
