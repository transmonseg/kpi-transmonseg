import { ClockCounterClockwise, FileMagnifyingGlass } from '@phosphor-icons/react/dist/ssr'
import { createServiceClient } from '@/lib/supabase/service'
import { fmtInstanteBR } from '@/lib/data-br'
import { RegenerarBotao } from './regenerar-botao'

type GeracaoRow = {
  id: string
  data_referencia: string
  gerado_em: string
  gerado_por: string | null
  qtd_cargas: number
  escala_storage_path: string | null
  romaneio_storage_path: string | null
}

const PER_PAGE = 30

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
    .select('id, data_referencia, gerado_em, gerado_por, qtd_cargas, escala_storage_path, romaneio_storage_path')
    .eq('cliente', 'nutrimax')
    .order('gerado_em', { ascending: false })
    .limit(PER_PAGE)

  if (error) throw new Error(error.message)
  const geracoes = (rows ?? []) as GeracaoRow[]

  return (
    <div className="mx-auto w-full max-w-[1000px]">
      <header className="mb-10 flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
          <ClockCounterClockwise size={11} weight="bold" className="inline mr-1" />
          Nutry Max · Histórico
        </span>
        <h1 className="text-display text-[36px] leading-[1.02] tracking-[-0.025em] text-[var(--color-fg)] md:text-[44px]">
          Gerações salvas
        </h1>
        <p className="mt-1 max-w-[55ch] text-[14px] leading-relaxed text-[var(--color-fg-muted)]">
          Registro de auditoria — quem gerou, quando e quantas cargas. A partir de 01/09 os PDFs
          originais (Escala + Romaneio) ficam guardados: use &quot;Regerar&quot; pra rodar o KPI de novo
          com qualquer correção aplicada desde a geração. Geração anterior a essa data não guardou
          os PDFs — baixe de novo gerando o KPI do mesmo dia se precisar.
        </p>
      </header>

      {geracoes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-6 py-16 text-center">
          <FileMagnifyingGlass size={28} weight="bold" className="text-[var(--color-fg-subtle)]" />
          <p className="text-[14px] text-[var(--color-fg-muted)]">Nenhuma geração registrada ainda.</p>
        </div>
      ) : (
        <div className="overflow-x-auto border-y border-[var(--color-border)]">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left">
                <Th>Data</Th>
                <Th align="right">Cargas</Th>
                <Th>Gerado por</Th>
                <Th>Gerado em</Th>
                <Th align="right">Ação</Th>
              </tr>
            </thead>
            <tbody>
              {geracoes.map(g => (
                <tr key={g.id} className="border-t border-[var(--color-border)]">
                  <Td>
                    <span className="font-medium text-[var(--color-fg)]">{formatarData(g.data_referencia)}</span>
                    <span className="ml-2 text-numeric text-[11px] text-[var(--color-fg-subtle)]">{g.data_referencia}</span>
                  </Td>
                  <Td align="right">
                    <span className="text-numeric text-[14px] font-medium text-[var(--color-fg)]">{g.qtd_cargas}</span>
                  </Td>
                  <Td>{g.gerado_por ?? '—'}</Td>
                  <Td>
                    <span className="text-numeric text-[12px] text-[var(--color-fg-muted)]">{fmtInstanteBR(g.gerado_em)}</span>
                  </Td>
                  <Td align="right">
                    {g.escala_storage_path && g.romaneio_storage_path ? (
                      <RegenerarBotao geracaoId={g.id} dataReferencia={g.data_referencia} />
                    ) : (
                      <span className="text-[11px] text-[var(--color-fg-subtle)]">—</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
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
