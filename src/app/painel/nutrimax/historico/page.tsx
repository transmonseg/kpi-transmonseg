import { FileMagnifyingGlass, SealCheck } from '@phosphor-icons/react/dist/ssr'
import { createServiceClient } from '@/lib/supabase/service'
import { fmtInstanteBR } from '@/lib/data-br'
import { RegenerarBotao } from './regenerar-botao'
import { BaixarXlsxSalvo } from '@/components/kpi/baixar-xlsx-salvo'
import { historicoComVersaoOficial, type GrupoVersoes, type ResumoVersao } from '@/lib/kpi-romaneio/versao-oficial'

type GeracaoRow = {
  id: string
  data_referencia: string
  gerado_em: string
  gerado_por: string | null
  qtd_cargas: number
  escala_storage_path: string | null
  romaneio_storage_path: string | null
  arquivo_storage_path: string | null
  resumo: ResumoVersao | null
}

// F3-04: gerações agrupadas por dia (cabe ~15 dias com as versões do dia).
const PER_PAGE = 60

function formatarData(iso: string): string {
  const [a, m, d] = iso.split('-')
  if (!a || !m || !d) return iso
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  const mi = Number.parseInt(m, 10) - 1
  return `${Number.parseInt(d, 10)} ${meses[mi] ?? m} ${a}`
}

export default async function NutrimaxHistoricoPage() {
  const svc = createServiceClient()
  const { data: rows, error } = await svc
    .from('kpi_romaneio_geracoes')
    .select('id, data_referencia, gerado_em, gerado_por, qtd_cargas, escala_storage_path, romaneio_storage_path, arquivo_storage_path, resumo')
    .eq('cliente', 'nutrimax')
    .order('gerado_em', { ascending: false })
    .limit(PER_PAGE)

  if (error) throw new Error(error.message)
  const geracoes = (rows ?? []) as GeracaoRow[]
  // F3-04 (ACH-10): uma versão oficial por dia; o resto recolhido como rascunho.
  const grupos = await historicoComVersaoOficial('nutrimax', geracoes)

  return (
    <div className="mx-auto w-full max-w-[1000px]">
      <header className="mb-10 flex flex-col gap-1.5">
        <span className="text-overline">
          Nutry Max · Histórico
        </span>
        <h1 className="text-display text-[34px] leading-none text-[var(--color-fg)] md:text-[40px]">
          Gerações salvas
        </h1>
        <p className="mt-2 max-w-[62ch] text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
          Registro de auditoria — quem gerou, quando e quantas cargas. Em cada dia, a versão
          &quot;Oficial (fechamento)&quot; é o fechamento das 00:30; as outras ficam recolhidas como rascunho,
          com a diferença de taxa. Gerar de novo um dia fechado pede o motivo. A partir de 01/09 os PDFs
          originais (Escala + Romaneio) ficam guardados: use &quot;Regerar&quot; pra rodar o KPI de novo
          com qualquer correção aplicada desde a geração. Geração anterior a essa data não guardou
          os PDFs — baixe de novo gerando o KPI do mesmo dia se precisar.
        </p>
      </header>

      {geracoes.length === 0 ? (
        <div className="dash-card flex flex-col items-center gap-3 px-6 py-16 text-center">
          <FileMagnifyingGlass size={28} weight="bold" className="text-[var(--color-fg-subtle)]" />
          <p className="text-[14px] text-[var(--color-fg-muted)]">Nenhuma geração registrada ainda.</p>
        </div>
      ) : (
        <div className="dash-card overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left">
                <Th>Data</Th>
                <Th align="right">Cargas</Th>
                <Th align="right">Taxa</Th>
                <Th>Gerado por</Th>
                <Th>Gerado em</Th>
                <Th align="right">Ação</Th>
              </tr>
            </thead>
            {grupos.map(gr => <GrupoDia key={gr.data} gr={gr} />)}
          </table>
        </div>
      )}
    </div>
  )
}

function Taxa({ taxa, aguardando }: { taxa: number | null | undefined; aguardando?: number }) {
  if (taxa == null) return <span className="text-[var(--color-fg-subtle)]">—</span>
  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      {aguardando ? (
        <span className="rounded-full bg-[var(--color-warning-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-warning)]">parcial</span>
      ) : (
        <span className={`size-2 rounded-full ${taxa >= 95 ? 'bg-[var(--color-success)]' : taxa >= 85 ? 'bg-[var(--color-warning)]' : 'bg-[var(--color-danger)]'}`} />
      )}
      <span className="text-[14px] font-semibold tabular-nums text-[var(--color-fg)]">{taxa.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span>
    </span>
  )
}

const pp = (d: number | null) => (d == null ? '' : d === 0 ? 'mesma taxa, outros números' : `${d > 0 ? '+' : '−'}${Math.abs(d).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} p.p.`)

function SeloOficial({ tipo }: { tipo: 'fechamento' | 'publicado' }) {
  return (
    <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-[var(--color-navy-700)]/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-navy-700)]">
      <SealCheck size={11} weight="bold" /> Oficial ({tipo === 'fechamento' ? 'fechamento' : 'publicado'})
    </span>
  )
}

function Acoes({ g }: { g: GeracaoRow }) {
  return (
    <div className="flex items-start justify-end gap-2">
      {g.arquivo_storage_path && <BaixarXlsxSalvo geracaoId={g.id} />}
      {g.escala_storage_path && g.romaneio_storage_path ? (
        <RegenerarBotao geracaoId={g.id} dataReferencia={g.data_referencia} />
      ) : !g.arquivo_storage_path ? (
        <span className="text-[11px] text-[var(--color-fg-subtle)]">—</span>
      ) : null}
    </div>
  )
}

function LinhaGeracao({ g, selo, diferenca, rascunho }: { g: GeracaoRow; selo?: 'fechamento' | 'publicado'; diferenca?: number | null; rascunho?: boolean }) {
  return (
    <tr className={`border-t border-[var(--color-border)] transition-colors hover:bg-[var(--color-bg-subtle)] ${rascunho ? 'text-[var(--color-fg-muted)]' : ''}`}>
      <Td>
        {rascunho ? (
          <span className="pl-3 text-[12px] text-[var(--color-fg-subtle)]">rascunho{diferenca != null ? ` · ${pp(diferenca)}` : ''}</span>
        ) : (
          <>
            <span className="font-medium text-[var(--color-fg)]">{formatarData(g.data_referencia)}</span>
            <span className="ml-2 text-numeric text-[11px] text-[var(--color-fg-subtle)]">{g.data_referencia}</span>
            {selo && <SeloOficial tipo={selo} />}
          </>
        )}
        {g.resumo?.motivoRegeracao && <span className="mt-1 block max-w-[40ch] whitespace-normal text-[11px] text-[var(--color-fg-subtle)]">Motivo: {g.resumo.motivoRegeracao}</span>}
      </Td>
      <Td align="right"><span className="text-numeric text-[14px] font-medium text-[var(--color-fg)]">{g.qtd_cargas}</span></Td>
      <Td align="right"><Taxa taxa={g.resumo?.taxa} aguardando={g.resumo?.aguardando} /></Td>
      <Td>{g.gerado_por ?? '—'}</Td>
      <Td><span className="text-numeric text-[12px] text-[var(--color-fg-muted)]">{fmtInstanteBR(g.gerado_em)}</span></Td>
      <Td align="right"><Acoes g={g} /></Td>
    </tr>
  )
}

/** F3-04: um dia = a versão oficial em cima e os rascunhos recolhidos. */
function GrupoDia({ gr }: { gr: GrupoVersoes<GeracaoRow> }) {
  return (
    <tbody>
      {gr.principal ? (
        <LinhaGeracao g={gr.principal} selo={gr.oficial?.tipo} />
      ) : gr.oficial ? (
        <tr className="border-t border-[var(--color-border)]">
          <Td>
            <span className="font-medium text-[var(--color-fg)]">{formatarData(gr.data)}</span>
            <span className="ml-2 text-numeric text-[11px] text-[var(--color-fg-subtle)]">{gr.data}</span>
            <SeloOficial tipo={gr.oficial.tipo} />
          </Td>
          <Td align="right"><span className="text-[var(--color-fg-subtle)]">—</span></Td>
          <Td align="right"><Taxa taxa={gr.oficial.taxa} /></Td>
          <Td>{gr.oficial.tipo === 'fechamento' ? 'Fechamento 00:30' : 'Dashboard'}</Td>
          <Td><span className="text-numeric text-[12px] text-[var(--color-fg-muted)]">{gr.oficial.calculadoEm ? fmtInstanteBR(gr.oficial.calculadoEm) : '—'}</span></Td>
          <Td align="right">
            <a href={`/painel/ao-vivo?cliente=nutrimax&data=${gr.data}`} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-3 py-1.5 text-[11px] font-medium text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)]">
              Ver no Ao vivo
            </a>
          </Td>
        </tr>
      ) : null}
      {gr.rascunhos.length > 0 && (
        <tr>
          <td colSpan={6} className="px-4 pb-3">
            <details className="group">
              <summary className="cursor-pointer select-none text-[12px] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
                {gr.rascunhos.length === 1 ? '1 rascunho' : `${gr.rascunhos.length} rascunhos`} deste dia
                {gr.oficial ? ' (diferença para o oficial)' : ''}
              </summary>
              <table className="mt-2 w-full text-[13px]">
                <tbody>
                  {gr.rascunhos.map(r => <LinhaGeracao key={r.g.id} g={r.g} diferenca={r.diferenca} rascunho />)}
                </tbody>
              </table>
            </details>
          </td>
        </tr>
      )}
      {gr.escondidas > 0 && (
        <tr><td colSpan={6} className="px-4 pb-3 text-[11px] text-[var(--color-fg-subtle)]">{gr.escondidas === 1 ? '1 versão escondida' : `${gr.escondidas} versões escondidas`} (inválida, guardada sem aparecer)</td></tr>
      )}
    </tbody>
  )
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={`px-4 py-3 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--color-fg-subtle)] ${align === 'right' ? 'text-right' : ''}`}>
      {children}
    </th>
  )
}

function Td({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return <td className={`whitespace-nowrap px-4 py-4 ${align === 'right' ? 'text-right' : ''}`}>{children}</td>
}
