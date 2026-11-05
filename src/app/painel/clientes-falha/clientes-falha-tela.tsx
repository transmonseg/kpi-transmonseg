'use client'

// F4-07 (GEO-24, ACH-07, D-08): "Clientes que sempre falham" (resumo) ->
// painel do cliente com "Corrigir ponto". Uma pergunta por tela: na lista,
// "qual cliente falha sempre pelo ponto?"; no painel, "qual evidência mostra
// o lugar certo?". Toda correção sai de uma evidência que o servidor
// recalcula; marcar no mapa é só do admin, com anexo. Nada é enviado daqui.
import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { CaretLeft, CaretRight, MapPin, Paperclip, ArrowCounterClockwise, Warning } from '@phosphor-icons/react/dist/ssr'
import { ROTULO_ACAO_PONTO, type AcaoPonto, type ClienteQueFalha } from '@/lib/kpi-romaneio/ponto-cliente'
import type { PainelCompleto } from '@/lib/kpi-romaneio/ponto-cliente-servico'
import type { LocalCliente } from '@/lib/kpi-romaneio/locais-clientes'
import { validarComprovante, ACCEPT_COMPROVANTE } from '@/lib/kpi-romaneio/comprovante'
import { buscarComSessao, lerJson, SessaoVencida } from '@/lib/sessao-fetch'
import type { PontoMapa } from './mapa-ponto'

const MapaPonto = dynamic(() => import('./mapa-ponto'), { ssr: false, loading: () => <div className="h-[360px] w-full rounded-2xl bg-[var(--color-bg-subtle)]" /> })

type ClienteLista = ClienteQueFalha & { local: LocalCliente | null }
type Lista = { dias: string[]; clientes: ClienteLista[]; admin: boolean }
const dataBR = (d: string) => d.split('-').reverse().slice(0, 2).join('/')
const metros = (m: number | null | undefined) => (m == null ? '?' : m >= 1000 ? `${(m / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km` : `${m} m`)
const ROTULO_FONTE: Record<string, string> = { manual: 'corrigido à mão', entrega_confirmada: 'aprendido de entregas', parada_orfa: 'aprendido de paradas' }
const motivoTerritorio = (t: string | null | undefined) => t === 'ok' ? null
  : t === 'municipio_divergente' ? 'Fica fora do município do endereço' : t === 'bairro_divergente' ? 'Fica fora do bairro do endereço (mais de 1 km)'
    : 'Não deu para conferir o município/bairro agora'
const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ' às')

export function ClientesFalhaTela({ codigoInicial }: { codigoInicial: string | null }) {
  const [codigo, setCodigo] = useState<string | null>(codigoInicial)
  useEffect(() => {
    const u = new URL(window.location.href)
    if (codigo) u.searchParams.set('codigo', codigo); else u.searchParams.delete('codigo')
    window.history.replaceState(null, '', u)
  }, [codigo])
  return codigo ? <PainelCliente codigo={codigo} onVoltar={() => setCodigo(null)} /> : <ListaClientes onAbrir={setCodigo} />
}

function ListaClientes({ onAbrir }: { onAbrir: (c: string) => void }) {
  const [r, setR] = useState<Lista | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const resp = await buscarComSessao('/api/kpi/ponto-cliente?cliente=nutrimax', { cache: 'no-store' })
        if (!resp.ok) throw new Error(await resp.text())
        const j = await lerJson<Lista>(resp)
        if (vivo) setR(j)
      } catch (e) {
        if (e instanceof SessaoVencida) return
        if (vivo) setErro('Não consegui ler os dias do Ao vivo agora. Tente de novo em instantes.')
      }
    })()
    return () => { vivo = false }
  }, [])
  return <ListaClientesView r={r} erro={erro} onAbrir={onAbrir} />
}

export function ListaClientesView({ r, erro, onAbrir }: { r: Lista | null; erro: string | null; onAbrir: (c: string) => void }) {
  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-5">
      <header className="flex flex-col gap-1.5">
        <Link href="/painel/ao-vivo?cliente=nutrimax" className="inline-flex items-center gap-1 text-[13px] font-semibold text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"><CaretLeft size={13} weight="bold" />Ao vivo</Link>
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-[var(--color-fg)]">Clientes que sempre falham</h1>
        <p className="text-[14px] text-[var(--color-fg-muted)]">
          Nutry Max · clientes que ficaram sem entrega confirmada por causa do ponto (coordenada, cadastro, endereço) em 3 dias ou mais
          {r?.dias.length ? ` dos ${r.dias.length} dias guardados no Ao vivo (${dataBR(r.dias[0])} a ${dataBR(r.dias[r.dias.length - 1])})` : ''}. Abra um cliente para corrigir o ponto com evidência.
        </p>
      </header>
      {erro && <p className="text-[13px] text-[var(--color-danger)]">{erro}</p>}
      {!r && !erro && <p className="text-[13px] text-[var(--color-fg-muted)]">Lendo os dias…</p>}
      {r && r.clientes.length === 0 && <p className="text-[13px] text-[var(--color-fg-muted)]">Nenhum cliente falhou pelo ponto em 3 dias ou mais.</p>}
      {r && r.clientes.length > 0 && (
        <ul className="flex flex-col divide-y divide-[var(--color-border)] rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
          {r.clientes.map(c => (
            <li key={c.codigo}>
              <button type="button" onClick={() => onAbrir(c.codigo)} className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-[var(--color-bg-subtle)]">
                <span className="flex w-14 shrink-0 flex-col items-center">
                  <span className="text-[20px] font-semibold tabular-nums text-[var(--color-fg)]">{c.diasFalhaPonto}</span>
                  <span className="text-[11px] text-[var(--color-fg-muted)]">de {c.dias} dias</span>
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[14px] font-semibold text-[var(--color-fg)]">{c.nome} <span className="font-normal text-[var(--color-fg-muted)]">· {c.codigo}</span></span>
                  <span className="truncate text-[12.5px] text-[var(--color-fg-muted)]">{c.motivos.map(m => `${m.motivo} (${m.dias})`).join(' · ')}</span>
                  <span className="truncate text-[12px] text-[var(--color-fg-muted)]">{c.endereco}</span>
                </span>
                <span className="hidden shrink-0 text-right text-[12px] text-[var(--color-fg-muted)] sm:block">
                  {c.local ? <>ponto guardado<br />{ROTULO_FONTE[c.local.fonte] ?? c.local.fonte}{c.local.fonte !== 'manual' ? ` (${c.local.confirmacoes}x)` : ''}</> : 'sem ponto guardado'}
                </span>
                <CaretRight size={14} className="shrink-0 text-[var(--color-fg-muted)]" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function PainelCliente({ codigo, onVoltar }: { codigo: string; onVoltar: () => void }) {
  const [p, setP] = useState<PainelCompleto | null>(null)
  const [admin, setAdmin] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const carregar = useCallback(async () => {
    try {
      const resp = await buscarComSessao(`/api/kpi/ponto-cliente?cliente=nutrimax&codigo=${encodeURIComponent(codigo)}`, { cache: 'no-store' })
      if (!resp.ok) throw new Error(await resp.text())
      const j = await lerJson<{ painel: PainelCompleto; admin: boolean }>(resp)
      setP(j.painel); setAdmin(j.admin); setErro(null)
    } catch (e) {
      if (e instanceof SessaoVencida) return
      setErro('Não consegui ler este cliente agora. Tente de novo em instantes.')
    }
  }, [codigo])
  useEffect(() => { void carregar() }, [carregar])

  async function enviar(campos: Record<string, string | File | null | undefined>): Promise<string | null> {
    const fd = new FormData()
    fd.set('codigo', codigo)
    for (const [k, v] of Object.entries(campos)) if (v != null && v !== '') fd.set(k, v)
    try {
      const resp = await buscarComSessao('/api/kpi/ponto-cliente?cliente=nutrimax', { method: 'POST', body: fd })
      if (!resp.ok) return await resp.text()
      await carregar()
      return null
    } catch (e) {
      if (e instanceof SessaoVencida) return 'Sessão vencida. Entre de novo.'
      return 'Não consegui gravar agora. Tente de novo.'
    }
  }
  return <PainelClienteView p={p} admin={admin} erro={erro} aviso={aviso} setAviso={setAviso} onVoltar={onVoltar} enviar={enviar} />
}

export function PainelClienteView({ p, admin, erro, aviso, setAviso, onVoltar, enviar }: {
  p: PainelCompleto | null; admin: boolean; erro: string | null; aviso: string | null; setAviso: (s: string | null) => void
  onVoltar: () => void; enviar: (c: Record<string, string | File | null | undefined>) => Promise<string | null>
}) {
  const [escolha, setEscolha] = useState<{ acao: AcaoPonto; id?: string } | null>(null)
  const [observacao, setObservacao] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [pino, setPino] = useState<{ lat: number; lng: number } | null>(null)
  const [gravando, setGravando] = useState(false)
  const [erroAcao, setErroAcao] = useState<string | null>(null)

  const pontos = useMemo<PontoMapa[]>(() => {
    if (!p) return []
    const out: PontoMapa[] = []
    if (p.pontoAtual) out.push({ id: 'atual', ...p.pontoAtual, tipo: 'atual', rotulo: `Ponto que o KPI usou em ${dataBR(p.pontoAtual.data)}` })
    if (p.local) out.push({ id: 'guardado', lat: p.local.lat, lng: p.local.lng, tipo: 'guardado', rotulo: `Ponto guardado (${ROTULO_FONTE[p.local.fonte] ?? p.local.fonte})` })
    p.paradas.forEach((c, i) => out.push({ id: c.id, lat: c.lat, lng: c.lng, tipo: 'parada', destaque: escolha?.id === c.id, rotulo: `Parada ${i + 1}: ${c.dias.length} dias, ${c.minutosMediana} min` }))
    p.cadastros.forEach(c => out.push({ id: c.id, lat: c.lat, lng: c.lng, tipo: 'cadastro', destaque: escolha?.id === c.id, rotulo: 'Cadastro da Unitrac' }))
    return out
  }, [p, escolha])

  if (!p) {
    return (
      <div className="mx-auto flex w-full max-w-[900px] flex-col gap-4">
        <button type="button" onClick={onVoltar} className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"><CaretLeft size={13} weight="bold" />Clientes que sempre falham</button>
        <p className={`text-[13px] ${erro ? 'text-[var(--color-danger)]' : 'text-[var(--color-fg-muted)]'}`}>{erro ?? 'Lendo o cliente…'}</p>
      </div>
    )
  }

  const protegido = p.local?.fonte === 'manual' && !admin
  async function gravar() {
    if (!escolha) return
    setErroAcao(null)
    if (arquivo) { const v = validarComprovante(arquivo); if (!v.ok) { setErroAcao(v.erro); return } }
    setGravando(true)
    const e = await enviar({ acao: escolha.acao, id: escolha.id, observacao, evidencia: arquivo, ...(escolha.acao === 'pino' && pino ? { lat: String(pino.lat), lng: String(pino.lng) } : {}) })
    setGravando(false)
    if (e) { setErroAcao(e); return }
    setAviso(`Ponto corrigido (${ROTULO_ACAO_PONTO[escolha.acao].toLowerCase()}). Vale a partir do próximo cálculo do Ao vivo; dias já fechados só mudam se forem recalculados.`)
    setEscolha(null); setObservacao(''); setArquivo(null); setPino(null)
  }
  async function desfazer(id: number) {
    setErroAcao(null)
    const e = await enviar({ acao: 'desfazer', correcao: String(id) })
    if (e) setErroAcao(e); else setAviso('Correção desfeita: o ponto voltou ao que era antes.')
  }
  const botao = (acao: AcaoPonto, id: string | undefined, habilitado: boolean, motivo: string | null) => (
    <button type="button" disabled={!habilitado || protegido || !p.correcaoLiberada} title={motivo ?? undefined}
      onClick={() => { setEscolha({ acao, id }); setErroAcao(null); if (acao === 'pino') setPino(p.local ?? p.pontoAtual ?? null) }}
      className={`h-8 shrink-0 rounded-full px-3.5 text-[12.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${escolha?.acao === acao && escolha.id === id ? 'bg-[var(--color-navy-700)] text-white' : 'border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-fg)] hover:border-[var(--color-border-strong)]'}`}>
      {ROTULO_ACAO_PONTO[acao]}
    </button>
  )
  const nfsFalha = p.nfs.filter(n => n.falha)

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-5">
      <header className="flex flex-col gap-1.5">
        <button type="button" onClick={onVoltar} className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"><CaretLeft size={13} weight="bold" />Clientes que sempre falham</button>
        <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-[var(--color-fg)]">{p.nome} <span className="text-[16px] font-normal text-[var(--color-fg-muted)]">· {p.codigo}</span></h1>
        <p className="text-[13px] text-[var(--color-fg-muted)]">{p.endereco}</p>
        <p className="text-[13px] text-[var(--color-fg-muted)]">
          Falhou em {new Set(nfsFalha.map(n => n.data)).size} de {new Set(p.nfs.map(n => n.data)).size} dias.
          {p.local ? ` Ponto guardado: ${ROTULO_FONTE[p.local.fonte] ?? p.local.fonte}${p.local.fonte !== 'manual' ? `, ${p.local.confirmacoes} confirmação(ões)` : ''}.` : ' Sem ponto guardado.'}
        </p>
      </header>

      {!p.correcaoLiberada && <p role="status" className="flex items-start gap-2 rounded-xl bg-[var(--color-bg-subtle)] px-3.5 py-2.5 text-[12.5px] text-[var(--color-fg)]"><Warning size={15} className="mt-0.5 shrink-0" />A correção de ponto ainda não está liberada (falta aplicar a migration da trilha). Dá para ver as evidências, mas nada é gravado.</p>}
      {protegido && <p role="status" className="rounded-xl bg-[var(--color-bg-subtle)] px-3.5 py-2.5 text-[12.5px] text-[var(--color-fg)]">Este cliente já tem ponto corrigido à mão. Para trocar, desfaça a correção anterior (abaixo) ou peça ao admin.</p>}
      {aviso && <p role="status" className="rounded-xl bg-[var(--color-bg-subtle)] px-3.5 py-2.5 text-[12.5px] text-[var(--color-fg)]">{aviso}</p>}

      <MapaPonto pontos={pontos} pinoEm={escolha?.acao === 'pino' ? pino : null} onMoverPino={setPino} />
      <p className="text-[12px] text-[var(--color-fg-muted)]">Círculo branco: ponto que o KPI usou. Círculo cheio: ponto guardado e paradas repetidas da placa. Tracejado: cadastro da Unitrac.</p>

      <section className="flex flex-col gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
        <h2 className="inline-flex items-center gap-2 text-[15px] font-semibold text-[var(--color-fg)]"><MapPin size={16} weight="bold" />Qual evidência mostra o lugar certo?</h2>
        <ul className="flex flex-col gap-2.5">
          {p.paradas.map((c, i) => {
            const motivo = c.ruaConfere === false ? 'A rua do endereço não passa por essa parada no CNEFE'
              : c.ruaConfere !== true ? 'A rua do endereço não foi achada no CNEFE perto dessa parada (ou a conferência está fora do ar)'
                : motivoTerritorio(c.territorio)
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-3 text-[13px]">
                <span className="min-w-0 flex-1 text-[var(--color-fg)]">
                  <strong className="font-semibold">Parada {i + 1}</strong>: a placa parou aqui em {c.dias.length} dias ({c.dias.map(dataBR).join(', ')}), {c.minutosMediana} min em média, a {metros(c.distPontoAtualM)} do ponto do KPI.{' '}
                  <span className="text-[var(--color-fg-muted)]">{c.ruaConfere === true ? `Rua do endereço no CNEFE a ${metros(c.ruaDistM)}.` : ''}{motivo ? ` ${motivo}.` : ''}</span>
                </span>
                {botao('parada', c.id, c.ruaConfere === true, motivo)}
              </li>
            )
          })}
          {p.cadastros.map(c => {
            const motivo = c.generico ? 'O mesmo ponto está cadastrado para outro cliente' : c.diasConfirmados.length === 0 ? 'Nenhuma parada da placa confirmou esse cadastro' : motivoTerritorio(c.territorio)
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-3 text-[13px]">
                <span className="min-w-0 flex-1 text-[var(--color-fg)]">
                  <strong className="font-semibold">Cadastro da Unitrac</strong>, a {metros(c.distPontoAtualM)} do ponto do KPI.{' '}
                  <span className="text-[var(--color-fg-muted)]">{c.diasConfirmados.length ? `Parada da placa a ${metros(c.distParadaM)} em ${c.diasConfirmados.map(dataBR).join(', ')}.` : ''}{motivo ? ` ${motivo}.` : ''}</span>
                </span>
                {botao('cadastro_unitrac', c.id, !motivo, motivo)}
              </li>
            )
          })}
          {p.local && p.local.fonte !== 'manual' && (
            <li className="flex flex-wrap items-center gap-3 text-[13px]">
              <span className="min-w-0 flex-1 text-[var(--color-fg)]"><strong className="font-semibold">Ponto aprendido</strong> ({ROTULO_FONTE[p.local.fonte]}) com {p.local.confirmacoes} confirmação(ões).</span>
              {botao('aprendido', undefined, p.local.confirmacoes >= 2, p.local.confirmacoes >= 2 ? null : 'Precisa de 2 dias que concordem')}
            </li>
          )}
          {admin && (
            <li className="flex flex-wrap items-center gap-3 text-[13px]">
              <span className="min-w-0 flex-1 text-[var(--color-fg)]"><strong className="font-semibold">Marcar no mapa</strong> (só admin): arraste o pino e anexe a evidência (foto, canhoto ou print do cadastro).</span>
              {botao('pino', undefined, true, null)}
            </li>
          )}
          {!p.paradas.length && !p.cadastros.length && (!p.local || p.local.fonte === 'manual') && !admin && (
            <li className="text-[13px] text-[var(--color-fg-muted)]">Nenhuma evidência ainda (parada repetida, cadastro confirmado ou ponto aprendido). Peça ao admin para marcar com a evidência anexada.</li>
          )}
        </ul>

        {escolha && (
          <div className="flex flex-col gap-2.5 border-t border-[var(--color-border)] pt-3">
            <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-[var(--color-fg)]">
              {escolha.acao === 'pino' ? 'De onde veio o ponto (obrigatório)' : 'Observação (opcional)'}
              <textarea value={observacao} onChange={e => setObservacao(e.target.value)} rows={2} maxLength={500}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[13px] font-normal text-[var(--color-fg)]" />
            </label>
            <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-3.5 py-1.5 text-[12.5px] font-semibold text-[var(--color-fg)]">
              <Paperclip size={14} />{arquivo ? arquivo.name : escolha.acao === 'pino' ? 'Anexar evidência (obrigatório)' : 'Anexar evidência (opcional)'}
              <input type="file" accept={ACCEPT_COMPROVANTE} className="sr-only" onChange={e => setArquivo(e.target.files?.[0] ?? null)} />
            </label>
            {escolha.acao === 'pino' && pino && <p className="text-[12px] text-[var(--color-fg-muted)]">Pino em {pino.lat.toFixed(6)}, {pino.lng.toFixed(6)}.</p>}
            {erroAcao && <p className="text-[12.5px] text-[var(--color-danger)]">{erroAcao}</p>}
            <div className="flex gap-2">
              <button type="button" disabled={gravando} onClick={() => void gravar()} className="h-9 rounded-full bg-[var(--color-navy-700)] px-4 text-[13px] font-semibold text-white disabled:opacity-60">{gravando ? 'Gravando…' : 'Gravar o ponto'}</button>
              <button type="button" onClick={() => { setEscolha(null); setErroAcao(null) }} className="h-9 rounded-full px-4 text-[13px] font-semibold text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Cancelar</button>
            </div>
          </div>
        )}
        {!escolha && erroAcao && <p className="text-[12.5px] text-[var(--color-danger)]">{erroAcao}</p>}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold text-[var(--color-fg)]">Dias deste cliente</h2>
        <ul className="flex flex-col divide-y divide-[var(--color-border)] rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[12.5px]">
          {p.nfs.map(n => (
            <li key={`${n.data}-${n.nf}`} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2">
              <span className="w-12 tabular-nums text-[var(--color-fg)]">{dataBR(n.data)}</span>
              <span className="w-20 text-[var(--color-fg-muted)]">{n.placa}</span>
              <span className="w-20 text-[var(--color-fg-muted)]">NF {n.nf}</span>
              <span className={`min-w-0 flex-1 truncate ${n.falha ? 'text-[var(--color-fg)]' : 'text-[var(--color-fg-muted)]'}`}>{n.falha ? n.status : n.situacao === 'entregue' ? 'Entregue' : n.status}</span>
              <Link href={`/painel/ao-vivo?cliente=nutrimax&data=${n.data}&placa=${encodeURIComponent(n.placa)}&nf=${encodeURIComponent(n.nf)}`} className="shrink-0 font-semibold text-[var(--color-navy-700)] hover:underline">Ver no Ao vivo</Link>
            </li>
          ))}
        </ul>
      </section>

      {p.correcoes.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[15px] font-semibold text-[var(--color-fg)]">Correções</h2>
          <ul className="flex flex-col divide-y divide-[var(--color-border)] rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[12.5px]">
            {p.correcoes.map((c, i) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1 text-[var(--color-fg)]">
                  {ROTULO_ACAO_PONTO[c.acao]} por {c.responsavel} em {quando(c.criado_em)}{c.observacao ? ` · ${c.observacao}` : ''}
                  {c.desfeita_em && <span className="text-[var(--color-fg-muted)]"> · desfeita por {c.desfeita_por} em {quando(c.desfeita_em)}</span>}
                </span>
                {c.temAnexo && <a href={`/api/kpi/ponto-cliente?cliente=nutrimax&codigo=${encodeURIComponent(p.codigo)}&evidencia=${c.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-[var(--color-navy-700)] hover:underline"><Paperclip size={13} />Evidência</a>}
                {i === 0 && !c.desfeita_em && (
                  <button type="button" onClick={() => void desfazer(c.id)} className="inline-flex items-center gap-1 font-semibold text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"><ArrowCounterClockwise size={13} />Desfazer</button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
