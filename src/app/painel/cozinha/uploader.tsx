'use client'

import { useState, useTransition } from 'react'

type Resultado = {
  rotas: { rota: string; motorista: string; placa: string }[]
  xlsxBase64: string
  pdfBase64: string
  nomeBase: string
}

export function CozinhaUploader() {
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [dataRef, setDataRef] = useState<string>(() => {
    const d = new Date()
    return d.toISOString().slice(0, 10)
  })
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  async function processar() {
    if (!arquivo) {
      setErro('Selecione um arquivo XLSX.')
      return
    }
    setErro(null)
    setResultado(null)

    const fd = new FormData()
    fd.append('arquivo', arquivo)
    fd.append('dataRef', dataRef)

    startTransition(async () => {
      try {
        const res = await fetch('/api/cozinha', { method: 'POST', body: fd })
        if (!res.ok) {
          const t = await res.text()
          throw new Error(t || 'Erro ao processar.')
        }
        const data = (await res.json()) as Resultado
        setResultado(data)
      } catch (e) {
        setErro(e instanceof Error ? e.message : String(e))
      }
    })
  }

  function baixar(base64: string, nome: string, mime: string) {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
    const blob = new Blob([new Uint8Array(bytes)], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nome
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const dataFormatada = formatarDataPtBr(dataRef)

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-white p-6 shadow-sm">
        <h2 className="font-semibold text-ink mb-4">Upload da escala</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">
              Arquivo XLSX
            </label>
            <label className="flex flex-col items-center justify-center w-full h-32 rounded-lg border-2 border-dashed border-border-strong bg-surface-alt hover:bg-brand-50 hover:border-brand-400 transition cursor-pointer text-center px-4">
              <svg
                className="h-7 w-7 text-ink-muted mb-2"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span className="text-sm text-ink font-medium">
                {arquivo ? arquivo.name : 'Clique para selecionar'}
              </span>
              <span className="text-xs text-ink-soft mt-0.5">
                Apenas .xlsx
              </span>
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={e => setArquivo(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">
              Data de referência
            </label>
            <input
              type="date"
              value={dataRef}
              onChange={e => setDataRef(e.target.value)}
              className="w-full rounded-lg border border-border-strong bg-white px-3.5 py-2.5 text-sm text-ink focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none transition"
            />
            <p className="mt-1.5 text-xs text-ink-soft">
              Aparece no cabeçalho do XLSX e PDF gerados.
            </p>
          </div>
        </div>

        {erro && (
          <div className="mt-5 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">
            {erro}
          </div>
        )}

        <button
          onClick={processar}
          disabled={pending || !arquivo}
          className="mt-5 inline-flex items-center justify-center rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition shadow-sm shadow-brand-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? (
            <>
              <svg
                className="animate-spin h-4 w-4 mr-2"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="3"
                  className="opacity-25"
                />
                <path
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
                />
              </svg>
              Processando...
            </>
          ) : (
            'Processar escala'
          )}
        </button>
      </div>

      {resultado && (
        <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-border flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-ink">Resultado</h2>
              <p className="text-sm text-ink-soft mt-0.5">
                {resultado.rotas.length} rotas extraídas
                {dataFormatada && ` para ${dataFormatada}`}.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  baixar(
                    resultado.xlsxBase64,
                    `${resultado.nomeBase}_LIMPO.xlsx`,
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition shadow-sm shadow-brand-600/20"
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                XLSX
              </button>
              <button
                onClick={() =>
                  baixar(
                    resultado.pdfBase64,
                    `${resultado.nomeBase}_LIMPO.pdf`,
                    'application/pdf'
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong bg-white px-3.5 py-2 text-sm font-semibold text-ink hover:bg-surface-hover transition"
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                PDF
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-brand-600 text-white">
                  <th className="px-4 py-3 text-left font-semibold w-12">#</th>
                  <th className="px-4 py-3 text-left font-semibold">Rota</th>
                  <th className="px-4 py-3 text-left font-semibold">
                    Motorista
                  </th>
                  <th className="px-4 py-3 text-left font-semibold w-28">
                    Placa
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {resultado.rotas.map((r, i) => (
                  <tr
                    key={i}
                    className={i % 2 === 1 ? 'bg-surface-alt' : 'bg-white'}
                  >
                    <td className="px-4 py-2.5 text-ink-soft">{i + 1}</td>
                    <td className="px-4 py-2.5 text-ink font-medium">
                      {r.rota}
                    </td>
                    <td className="px-4 py-2.5 text-ink">{r.motorista}</td>
                    <td className="px-4 py-2.5 text-ink font-mono text-xs">
                      {r.placa}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function formatarDataPtBr(iso: string): string | null {
  if (!iso) return null
  const [a, m, d] = iso.split('-')
  if (!a || !m || !d) return null
  return `${d}/${m}/${a}`
}
