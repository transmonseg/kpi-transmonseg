'use client'

import { useState } from 'react'
import { CheckCircle, WarningCircle, WifiSlash, X } from '@phosphor-icons/react/dist/ssr'
import { Button, Card, CardContent } from '@/components/ui'

interface PreviewPlaca {
  placa: string
  motorista: string | null
  lojas_escala: Array<{ nome: string; codigo: string | null; ordem: number }>
}
interface PreviewPlacaParcial extends PreviewPlaca {
  lojas_casadas: string[]
  lojas_sem_match: string[]
}
interface PreviewRedeBucket {
  total: number
  ok_full: PreviewPlaca[]
  ok_parcial: PreviewPlacaParcial[]
  sem_rastreador: PreviewPlaca[]
}
interface PreviewResposta {
  data: string
  total_placas_escala: number
  total_placas_unitrac: number
  redes: Record<string, PreviewRedeBucket>
  fora_escala: Array<{ placa: string; paradas: Array<{ codigo: string | null; nome: string | null; chegada: string }> }>
}

export default function RevisarKpiPage() {
  const [data, setData] = useState('')
  const [escalaPaths, setEscalaPaths] = useState('')
  const [unitracPaths, setUnitracPaths] = useState('')
  const [preview, setPreview] = useState<PreviewResposta | null>(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [redeAberta, setRedeAberta] = useState<string | null>(null)

  async function carregarPreview() {
    setLoading(true)
    setErro(null)
    setPreview(null)
    try {
      const r = await fetch('/api/kpi/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data,
          escalaBucketPaths: escalaPaths.split(',').map(s => s.trim()).filter(Boolean),
          unitracBucketPaths: unitracPaths.split(',').map(s => s.trim()).filter(Boolean),
        }),
      })
      if (!r.ok) throw new Error(await r.text())
      setPreview(await r.json())
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Revisão antes de gerar KPI</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Cada quadrante mostra uma rede com as placas separadas em: ✓ casadas / ⚠ parciais / ⊙ sem rastreador.
        Use isso pra conferir antes de bater o KPI final.
      </p>

      <Card className="mb-6">
        <CardContent className="p-4 space-y-3">
          <div>
            <label className="text-sm font-medium">Data (YYYY-MM-DD)</label>
            <input className="w-full mt-1 px-3 py-2 border rounded" value={data} onChange={e => setData(e.target.value)} placeholder="2026-05-22" />
          </div>
          <div>
            <label className="text-sm font-medium">Bucket paths escala (vírgula)</label>
            <input className="w-full mt-1 px-3 py-2 border rounded" value={escalaPaths} onChange={e => setEscalaPaths(e.target.value)} placeholder="user-id/escala1.xlsx,user-id/escala2.xlsx" />
          </div>
          <div>
            <label className="text-sm font-medium">Bucket paths Unitrac (vírgula)</label>
            <input className="w-full mt-1 px-3 py-2 border rounded" value={unitracPaths} onChange={e => setUnitracPaths(e.target.value)} placeholder="user-id/unitrac.xlsx" />
          </div>
          <Button onClick={carregarPreview} disabled={loading || !data}>
            {loading ? 'Carregando...' : 'Carregar revisão'}
          </Button>
          {erro && <div className="text-sm text-red-600 mt-2">{erro}</div>}
        </CardContent>
      </Card>

      {preview && (
        <>
          <div className="mb-4 text-sm">
            <strong>{preview.data}</strong> · {preview.total_placas_escala} placas na escala · {preview.total_placas_unitrac} placas no Unitrac · {preview.fora_escala.length} fora da escala
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(preview.redes).sort((a, b) => b[1].total - a[1].total).map(([rede, bucket]) => {
              const okPct = bucket.total === 0 ? 0 : Math.round((bucket.ok_full.length / bucket.total) * 100)
              return (
                <Card key={rede} className="cursor-pointer hover:bg-gray-50" onClick={() => setRedeAberta(redeAberta === rede ? null : rede)}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="font-semibold">{rede}</h3>
                      <span className="text-xs text-muted-foreground">{bucket.total} linhas</span>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex items-center gap-2"><CheckCircle className="text-green-600" /> <strong>{bucket.ok_full.length}</strong> placas casaram (todas as rotas) {okPct}%</div>
                      <div className="flex items-center gap-2"><WarningCircle className="text-amber-600" /> <strong>{bucket.ok_parcial.length}</strong> parciais (revisar)</div>
                      <div className="flex items-center gap-2"><WifiSlash className="text-gray-500" /> <strong>{bucket.sem_rastreador.length}</strong> sem rastreador</div>
                    </div>

                    {redeAberta === rede && (
                      <div className="mt-4 border-t pt-3 space-y-3 text-xs">
                        {bucket.ok_parcial.length > 0 && (
                          <div>
                            <div className="font-medium text-amber-700 mb-1">⚠ PARCIAIS — revisar</div>
                            {bucket.ok_parcial.map(p => (
                              <div key={p.placa} className="mb-2 pl-2 border-l-2 border-amber-300">
                                <div><strong>{p.placa}</strong> {p.motorista && `· ${p.motorista}`}</div>
                                <div className="text-green-700">✓ {p.lojas_casadas.join(' | ')}</div>
                                <div className="text-red-700">✗ {p.lojas_sem_match.join(' | ')}</div>
                              </div>
                            ))}
                          </div>
                        )}
                        {bucket.sem_rastreador.length > 0 && (
                          <div>
                            <div className="font-medium text-gray-700 mb-1">⊙ SEM RASTREADOR — KPI sai sem horários</div>
                            {bucket.sem_rastreador.map(p => (
                              <div key={p.placa} className="mb-1 pl-2 border-l-2 border-gray-300">
                                <strong>{p.placa}</strong> {p.motorista && `· ${p.motorista}`} — {p.lojas_escala.map(l => l.nome).join(' | ')}
                              </div>
                            ))}
                          </div>
                        )}
                        {bucket.ok_full.length > 0 && (
                          <details>
                            <summary className="font-medium text-green-700 cursor-pointer">✓ {bucket.ok_full.length} OK_FULL</summary>
                            <div className="mt-1">
                              {bucket.ok_full.map(p => (
                                <div key={p.placa} className="text-xs text-muted-foreground">{p.placa} {p.motorista && `(${p.motorista})`}</div>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {preview.fora_escala.length > 0 && (
            <Card className="mt-4">
              <CardContent className="p-4">
                <h3 className="font-semibold mb-2 flex items-center gap-2"><X /> Placas no Unitrac que não estão na escala ({preview.fora_escala.length})</h3>
                <div className="text-xs space-y-1">
                  {preview.fora_escala.map(p => (
                    <div key={p.placa}>
                      <strong>{p.placa}</strong>: {p.paradas.map(par => par.nome ?? par.codigo).join(', ')}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
