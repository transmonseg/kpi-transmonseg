'use client'

import { useMemo, useState } from 'react'

// Coluna genérica: render pra exibir, ord (opcional) pra ordenar, busca (opcional)
// pra entrar no filtro. Sem acesso por string-key (evita `any`).
export type ColunaRanking<T> = {
  chave: string
  titulo: string
  alinhar?: 'left' | 'right'
  render: (linha: T) => React.ReactNode
  ord?: (linha: T) => number | string
  busca?: (linha: T) => string
}

const CARD = 'rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-soft'

export function TabelaRanking<T>({ titulo, ancora, colunas, linhas, sub, buscaPlaceholder }: {
  titulo: string
  ancora: string
  colunas: ColunaRanking<T>[]
  linhas: T[]
  sub?: string
  buscaPlaceholder?: string
}) {
  const [ordCol, setOrdCol] = useState<string | null>(null)
  const [ordDir, setOrdDir] = useState<'asc' | 'desc'>('desc')
  const [busca, setBusca] = useState('')

  const temBusca = colunas.some(c => c.busca)

  const linhasFmt = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    let r = linhas
    if (termo) {
      const cols = colunas.filter(c => c.busca)
      r = linhas.filter(l => cols.some(c => (c.busca!(l) || '').toLowerCase().includes(termo)))
    }
    const col = ordCol ? colunas.find(c => c.chave === ordCol && c.ord) : null
    if (col?.ord) {
      const val = col.ord
      r = [...r].sort((a, b) => {
        const va = val(a), vb = val(b)
        if (typeof va === 'number' && typeof vb === 'number') return ordDir === 'asc' ? va - vb : vb - va
        return ordDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va))
      })
    }
    return r
  }, [linhas, colunas, busca, ordCol, ordDir])

  const clicaOrd = (c: ColunaRanking<T>) => {
    if (!c.ord) return
    if (ordCol === c.chave) setOrdDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setOrdCol(c.chave); setOrdDir('desc') }
  }

  return (
    <section id={ancora} className={`scroll-mt-24 overflow-hidden ${CARD}`}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-[var(--color-fg)]">
            {titulo}
            <span className="text-numeric text-[12px] font-medium text-[var(--color-fg-subtle)]">{linhasFmt.length}</span>
          </h2>
          {sub && <p className="mt-0.5 text-[12px] text-[var(--color-fg-subtle)]">{sub}</p>}
        </div>
        {temBusca && (
          <input
            value={busca} onChange={e => setBusca(e.target.value)}
            placeholder={buscaPlaceholder ?? 'Buscar…'}
            className="h-9 w-full max-w-[220px] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-[13px] text-[var(--color-fg)] outline-none transition-colors focus:border-[var(--color-accent)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30"
          />
        )}
      </header>

      {linhasFmt.length === 0 ? (
        <p className="px-5 py-10 text-center text-[13px] text-[var(--color-fg-muted)]">Nada pra mostrar aqui.</p>
      ) : (
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 z-10 bg-[var(--color-bg-elevated)]">
              <tr className="border-b border-[var(--color-border)] text-left text-[10px] uppercase tracking-[0.1em] text-[var(--color-fg-subtle)]">
                <th className="px-4 py-3 font-semibold">#</th>
                {colunas.map(c => {
                  const ativo = ordCol === c.chave
                  return (
                    <th
                      key={c.chave}
                      aria-sort={ativo ? (ordDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      onClick={() => clicaOrd(c)}
                      className={[
                        'px-3 py-3 font-semibold',
                        c.alinhar === 'right' ? 'text-right' : 'text-left',
                        c.ord ? 'cursor-pointer select-none hover:text-[var(--color-fg)]' : '',
                      ].join(' ')}
                    >
                      {c.titulo}{c.ord && <span className="ml-1 text-[var(--color-fg-subtle)]">{ativo ? (ordDir === 'asc' ? '▲' : '▼') : '↕'}</span>}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {linhasFmt.map((l, i) => (
                <tr key={i} className="transition-colors hover:bg-[var(--color-bg-subtle)]">
                  <td className="px-4 py-2.5 text-numeric text-[12px] text-[var(--color-fg-subtle)]">{i + 1}</td>
                  {colunas.map(c => (
                    <td key={c.chave} className={`px-3 py-2.5 ${c.alinhar === 'right' ? 'text-right text-numeric' : 'text-left'}`}>
                      {c.render(l)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
