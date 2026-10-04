import { ClockCounterClockwise, FileMagnifyingGlass } from '@phosphor-icons/react/dist/ssr'
import { createServiceClient } from '@/lib/supabase/service'
import { fmtInstanteBR } from '@/lib/data-br'
import { RegenerarBotao } from './regenerar-botao'
import { podeRegerar } from './pode-regerar'
import { BaixarXlsxSalvo } from '@/components/kpi/baixar-xlsx-salvo'

type GeracaoRow = {
  id: string
  data_referencia: string
  gerado_em: string
  gerado_por: string | null
  qtd_cargas: number
  escala_storage_path: string | null
  romaneio_storage_path: string | null
  arquivo_storage_path: string | null
  resumo: { taxa: number | null; aguardando?: number } | null
}

const PER_PAGE = 30

function formatarData(iso: string): string {
  const [a, m, d] = iso.split('-')
  if (!a || !m || !d) return iso
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  const mi = Number.parseInt(m, 10) - 1
  return `${Number.parseInt(d, 10)} ${meses[mi] ?? m} ${a}`
}

export default async function RioQualityHistoricoPage() {
  const svc = createServiceClient()
  // escala_storage_path/romaneio_storage_path guardam, pra Rio Quality, as
  // planilhas Custos/Entregas (mesmas colunas da tabela, ver a rota gerar).
  const { data: rows, error } = await svc
    .from('kpi_romaneio_geracoes')
    .select('id, data_referencia, gerado_em, gerado_por, qtd_cargas, escala_storage_path, romaneio_storage_path, arquivo_storage_path, resumo')
    .eq('cliente', 'rioquality')
    .order('gerado_em', { ascending: false })
    .limit(PER_PAGE)

  if (error) throw new Error(error.message)
  const geracoes = (rows ?? []) as GeracaoRow[]

  return (
    <div className="mx-auto w-full max-w-[1000px]">
      <header className="mb-8">
        <h1 className="text-[28px] font-semibold leading-[1.1] tracking-[-0.022em] text-[var(--color-fg)] sm:text-[34px]">Histórico</h1>
        <p className="mt-1.5 max-w-[60ch] text-[15px] text-[var(--color-fg-muted)]">
          Cada KPI gerado da Rio Quality: quem gerou, quando e o resultado. Baixe a planilha salva ou regere com as correções mais recentes.
        </p>
      </header>

      {geracoes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[var(--radius-lg)] bg-[var(--color-bg-elevated)] shadow-soft px-6 py-16 text-center">
          <FileMagnifyingGlass size={28} weight="bold" className="text-[var(--color-fg-subtle)]" />
          <p className="text-[14px] text-[var(--color-fg-muted)]">Nenhuma geração registrada ainda.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] bg-[var(--color-bg-elevated)] shadow-soft">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left">
                <Th>Data</Th>
                <Th align="right">Rotas</Th>
                <Th align="right">Taxa</Th>
                <Th>Gerado por</Th>
                <Th>Gerado em</Th>
                <Th align="right">Ação</Th>
              </tr>
            </thead>
            <tbody>
              {geracoes.map(g => (
                <tr key={g.id} className="border-t border-[var(--color-border)] u-motion hover:bg-[var(--color-bg-subtle)]">
                  <Td>
                    <span className="font-medium text-[var(--color-fg)]">{formatarData(g.data_referencia)}</span>
                    
                  </Td>
                  <Td align="right">
                    <span className="text-numeric text-[14px] font-medium text-[var(--color-fg)]">{g.qtd_cargas}</span>
                  </Td>
                  <Td align="right">
                    {g.resumo?.taxa != null ? (
                      <span className="inline-flex items-center justify-end gap-1.5">
                        {g.resumo.aguardando ? (
                          <span className="rounded-full bg-[var(--color-warning-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-warning)]">Parcial</span>
                        ) : (
                          <span className={`size-2 rounded-full ${g.resumo.taxa >= 95 ? 'bg-[var(--color-success)]' : 'bg-[var(--color-warning)]'}`} />
                        )}
                        <span className="num text-[14px] font-semibold text-[var(--color-fg)]">{g.resumo.taxa.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span>
                      </span>
                    ) : <span className="text-[var(--color-fg-subtle)]">—</span>}
                  </Td>
                  <Td>{g.gerado_por ?? '—'}</Td>
                  <Td>
                    <span className="text-numeric text-[12px] text-[var(--color-fg-muted)]">{fmtInstanteBR(g.gerado_em)}</span>
                  </Td>
                  <Td align="right">
                    <div className="flex items-start justify-end gap-2">
                      {g.arquivo_storage_path && <BaixarXlsxSalvo geracaoId={g.id} />}
                      {podeRegerar(g) ? (
                        <RegenerarBotao geracaoId={g.id} dataReferencia={g.data_referencia} />
                      ) : !g.arquivo_storage_path ? (
                        <span className="text-[11px] text-[var(--color-fg-subtle)]">—</span>
                      ) : null}
                    </div>
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
    <th className={`px-4 py-3 text-[13px] font-medium text-[var(--color-fg-muted)] ${align === 'right' ? 'text-right' : ''}`}>
      {children}
    </th>
  )
}

function Td({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return <td className={`whitespace-nowrap px-4 py-4 ${align === 'right' ? 'text-right' : ''}`}>{children}</td>
}
