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
      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700">
              Arquivo XLSX
            </label>
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={e => setArquivo(e.target.files?.[0] ?? null)}
              className="mt-1 w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:text-white file:px-3 file:py-2 file:cursor-pointer cursor-pointer text-zinc-600"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700">
              Data de referência
            </label>
            <input
              type="date"
              value={dataRef}
              onChange={e => setDataRef(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
            />
          </div>
        </div>

        {erro && (
          <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {erro}
          </div>
        )}

        <button
          onClick={processar}
          disabled={pending || !arquivo}
          className="mt-4 inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? 'Processando...' : 'Processar escala'}
        </button>
      </div>

      {resultado && (
        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Resultado</h2>
              <p className="text-sm text-zinc-600 mt-1">
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
                className="inline-flex items-center rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 transition"
              >
                Baixar XLSX
              </button>
              <button
                onClick={() =>
                  baixar(
                    resultado.pdfBase64,
                    `${resultado.nomeBase}_LIMPO.pdf`,
                    'application/pdf'
                  )
                }
                className="inline-flex items-center rounded-lg bg-rose-700 px-3 py-2 text-sm font-medium text-white hover:bg-rose-800 transition"
              >
                Baixar PDF
              </button>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-zinc-100 text-left">
                  <th className="px-3 py-2 font-medium text-zinc-700 border border-zinc-200 w-12">
                    #
                  </th>
                  <th className="px-3 py-2 font-medium text-zinc-700 border border-zinc-200">
                    Rota
                  </th>
                  <th className="px-3 py-2 font-medium text-zinc-700 border border-zinc-200">
                    Motorista
                  </th>
                  <th className="px-3 py-2 font-medium text-zinc-700 border border-zinc-200">
                    Placa
                  </th>
                </tr>
              </thead>
              <tbody>
                {resultado.rotas.map((r, i) => (
                  <tr key={i} className={i % 2 ? 'bg-zinc-50' : ''}>
                    <td className="px-3 py-2 border border-zinc-200 text-center">
                      {i + 1}
                    </td>
                    <td className="px-3 py-2 border border-zinc-200">
                      {r.rota}
                    </td>
                    <td className="px-3 py-2 border border-zinc-200">
                      {r.motorista}
                    </td>
                    <td className="px-3 py-2 border border-zinc-200 text-center font-mono text-xs">
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
