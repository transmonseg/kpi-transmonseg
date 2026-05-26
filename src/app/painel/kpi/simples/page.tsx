'use client'

import { useState, useTransition, useRef, useCallback, useEffect } from 'react'
import {
  UploadSimple,
  FilePdf,
  FileXls,
  X,
  CaretDown,
  FileArrowDown,
  ChartBarHorizontal,
  WarningCircle,
  CheckCircle,
  ArrowRight,
  CalendarBlank,
  WifiSlash,
  WifiHigh,
  ArrowClockwise,
} from '@phosphor-icons/react/dist/ssr'
import { Button, Card, CardContent, Input, cn } from '@/components/ui'

type VeiculoSlot = {
  motorista_nome: string | null
  motorista_codigo: number | null
  placa_raw: string | null
  placa_norm: string | null
}

type AlteracaoParsed = {
  tipo: 'SUBSTITUICAO' | 'INCLUSAO' | 'COMUNICADO' | 'INFORMATIVO' | 'SWAP'
  rede_id: string | null
  loja_nome_raw: string | null
  entra: VeiculoSlot | null
  sai: VeiculoSlot | null
  motivo: string | null
  texto_original: string
  confianca: 'alta' | 'media' | 'baixa'
}

type PreviewLinha = {
  ordem: number
  loja_nome: string
  placa: string | null
  motorista: string | null
  turno: string
  tem_gps: boolean
  saida_cd_fmt: string | null
  chegada_loja_fmt: string | null
  tempo_loja_min: number | null
  confianca: 'HIGH' | 'LOW' | 'UNMATCHED'
  algoritmo: string
  anomalias: string[]
}

type LineEditPatch = {
  placa?: string
  motorista?: string
  loja?: string
  turno?: string
  saida_cd?: string
  chegada_loja?: string
  tempo_loja_min?: number | null
}

type RedeResult = {
  rede_id: string
  rede_nome: string
  qtd_rotas: number
  qtd_sem_gps: number
  xlsxBase64: string
  pdfBase64: string
  preview: PreviewLinha[]
}

function downloadBase64(base64: string, filename: string, mime: string) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10)
}

function fmtSlot(slot: VeiculoSlot | null): string {
  if (!slot) return '—'
  const parts: string[] = []
  if (slot.motorista_nome) parts.push(slot.motorista_nome)
  if (slot.motorista_codigo !== null && slot.motorista_codigo !== undefined) parts.push(`#${slot.motorista_codigo}`)
  if (slot.placa_norm) parts.push(slot.placa_norm)
  return parts.join(' · ') || '—'
}

const TIPO_LABELS: Record<AlteracaoParsed['tipo'], string> = {
  SUBSTITUICAO: 'Substituição',
  INCLUSAO: 'Inclusão',
  COMUNICADO: 'Comunicado',
  INFORMATIVO: 'Informativo',
  SWAP: 'Swap',
}

const CONF_CLASS: Record<string, string> = {
  alta: 'text-[var(--color-success)]',
  media: 'text-[var(--color-warning)]',
  baixa: 'text-[var(--color-danger)]',
}

// ─── Seção de alterações ────────────────────────────────────────────────────

interface AlteracoesCardProps {
  confirmadas: AlteracaoParsed[]
  onConfirm: (a: AlteracaoParsed) => void
  onRemove: (idx: number) => void
  /** Data da escala (YYYY-MM-DD) — usada pra inferir `Sai` quando alteração não traz */
  data?: string
}

const REDES_OPCOES: Array<{ value: string; label: string }> = [
  { value: 'ASSAI',           label: 'Assaí' },
  { value: 'ATACADAO',        label: 'Atacadão' },
  { value: 'CARREFOUR',       label: 'Carrefour' },
  { value: 'MUNDIAL',         label: 'Mundial' },
  { value: 'PREZUNIC',        label: 'Prezunic' },
  { value: 'PRINCESA',        label: 'Princesa' },
  { value: 'SAMS_CLUB',       label: "Sam's Club" },
  { value: 'SENDAS',          label: 'Sendas' },
  { value: 'SUPERPRIX',       label: 'Super Prix' },
  { value: 'VIANENSE',        label: 'Vianense' },
  { value: 'CAB_PETROPOLIS',  label: 'CAB Petrópolis' },
  { value: 'ZONA_SUL',        label: 'Zona Sul' },
  { value: 'SUPER_PAX',       label: 'Super Pax' },
  { value: 'FEIRA_NOVA',      label: 'Feira Nova' },
  { value: 'EMANUEL',         label: 'Emanuel' },
  { value: 'ARMAZEM_GRAO',    label: 'Armazém do Grão' },
  { value: 'GUANABARA',       label: 'Guanabara' },
]

function normalizaPlaca(p: string): string {
  return p.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7)
}

// T4 helper: lê arquivo .txt com fallback de encoding (UTF-8 → UTF-16 BOM).
// WhatsApp Desktop Windows exporta como UTF-16 LE com BOM — file.text() assume UTF-8.
async function readTxtWithEncodingFallback(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  // Detecta UTF-16 LE BOM (FF FE) ou UTF-16 BE BOM (FE FF)
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return new TextDecoder('utf-16le').decode(buffer)
  }
  if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
    return new TextDecoder('utf-16be').decode(buffer)
  }
  // Default UTF-8 (sem BOM ou com BOM EF BB BF — TextDecoder UTF-8 já trata)
  return new TextDecoder('utf-8').decode(buffer)
}

function AlteracoesCard({ confirmadas, onConfirm, onRemove, data }: AlteracoesCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [modo, setModo] = useState<'texto' | 'pdf' | 'manual' | 'txt'>('texto')
  const [texto, setTexto] = useState('')
  const [previews, setPreviews] = useState<AlteracaoParsed[]>([])
  const [analisando, startAnalisar] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  // T3 — estado do formulário manual
  const [manualTipo, setManualTipo] = useState<AlteracaoParsed['tipo']>('SUBSTITUICAO')
  const [manualRede, setManualRede] = useState<string>('')
  const [manualLoja, setManualLoja] = useState<string>('')
  const [manualSaiPlaca, setManualSaiPlaca] = useState<string>('')
  const [manualSaiMotorista, setManualSaiMotorista] = useState<string>('')
  const [manualEntraPlaca, setManualEntraPlaca] = useState<string>('')
  const [manualEntraMotorista, setManualEntraMotorista] = useState<string>('')
  const [manualEntraCodigo, setManualEntraCodigo] = useState<string>('')
  const [manualMotivo, setManualMotivo] = useState<string>('')
  const [sucessoManual, setSucessoManual] = useState(false)

  function resetManual() {
    setManualRede(''); setManualLoja(''); setManualSaiPlaca(''); setManualSaiMotorista('')
    setManualEntraPlaca(''); setManualEntraMotorista(''); setManualEntraCodigo(''); setManualMotivo('')
  }

  function adicionarManual() {
    const placaSaiNorm = manualSaiPlaca ? normalizaPlaca(manualSaiPlaca) : null
    const placaEntraNorm = manualEntraPlaca ? normalizaPlaca(manualEntraPlaca) : null
    const motoristaSai = manualSaiMotorista.trim() || null
    const motoristaEntra = manualEntraMotorista.trim() || null
    const codigoEntra = manualEntraCodigo.trim() ? Number(manualEntraCodigo.trim()) : null

    if (!placaEntraNorm && !motoristaEntra) {
      setErr('Preencha ao menos placa OU motorista no campo "Entra".')
      return
    }

    // R1: rebaixa tipo de forma coerente com o conteúdo dos slots.
    // Se usuário escolheu SUBSTITUICAO/SWAP mas não preencheu Sai, vira INCLUSAO.
    const temSai = !!(placaSaiNorm || motoristaSai)
    let tipoFinal: AlteracaoParsed['tipo'] = manualTipo
    if ((manualTipo === 'SUBSTITUICAO' || manualTipo === 'SWAP') && !temSai) {
      tipoFinal = 'INCLUSAO'
    }

    const alt: AlteracaoParsed = {
      tipo: tipoFinal,
      rede_id: manualRede || null,
      loja_nome_raw: manualLoja.trim() || null,
      entra: (placaEntraNorm || motoristaEntra) ? {
        motorista_nome: motoristaEntra,
        motorista_codigo: codigoEntra && !isNaN(codigoEntra) ? codigoEntra : null,
        placa_raw: placaEntraNorm,
        placa_norm: placaEntraNorm,
      } : null,
      sai: temSai ? {
        motorista_nome: motoristaSai,
        motorista_codigo: null,
        placa_raw: placaSaiNorm,
        placa_norm: placaSaiNorm,
      } : null,
      motivo: manualMotivo.trim() || null,
      texto_original: `[MANUAL] ${tipoFinal} ${manualRede || ''} ${manualLoja || ''}`.trim(),
      confianca: 'alta',
    }
    onConfirm(alt)
    resetManual()
    setErr(null)
    // R2 P0: feedback visual de sucesso (timeout 2s)
    setSucessoManual(true)
    setTimeout(() => setSucessoManual(false), 2000)
  }

  function resetPreviews() { setPreviews([]); setErr(null) }

  function analisarTexto() {
    if (!texto.trim()) return
    resetPreviews()
    startAnalisar(async () => {
      try {
        const res = await fetch('/api/kpi/simples/analisar-alt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texto, data }),
        })
        if (!res.ok) throw new Error(await res.text())
        setPreviews(await res.json() as AlteracaoParsed[])
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Erro ao analisar.')
      }
    })
  }

  function analisarPdf(file: File) {
    resetPreviews()
    startAnalisar(async () => {
      try {
        const fd = new FormData()
        fd.append('pdf', file)
        if (data) fd.append('data', data)
        const res = await fetch('/api/kpi/simples/analisar-alt', { method: 'POST', body: fd })
        if (!res.ok) throw new Error(await res.text())
        setPreviews(await res.json() as AlteracaoParsed[])
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Erro ao analisar.')
      }
    })
  }

  // T4: lê arquivo .txt (com fallback UTF-16 BOM pra WhatsApp Desktop Windows)
  // e envia o conteúdo como texto pro mesmo endpoint do modo "texto".
  function analisarTxt(file: File) {
    resetPreviews()
    startAnalisar(async () => {
      try {
        const conteudo = await readTxtWithEncodingFallback(file)
        const res = await fetch('/api/kpi/simples/analisar-alt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texto: conteudo, data }),
        })
        if (!res.ok) throw new Error(await res.text())
        setPreviews(await res.json() as AlteracaoParsed[])
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Erro ao ler .txt.')
      }
    })
  }

  function confirmar(a: AlteracaoParsed) {
    onConfirm(a)
    setPreviews(prev => prev.filter(p => p !== a))
  }

  const count = confirmadas.length

  return (
    <Card>
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3 cursor-pointer text-left hover:bg-[var(--color-bg-hover)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">
            Alterações de Escala
          </span>
          {count > 0 && (
            <span className="text-xs bg-[var(--color-info-soft)] text-[var(--color-info-soft-fg)] px-2 py-0.5 rounded-full font-medium">
              {count} confirmada{count !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <CaretDown size={16} weight="bold" className={cn('text-[var(--color-fg-muted)] transition-transform duration-200', expanded && 'rotate-180')} />
      </button>

      {expanded && (
        <CardContent className="space-y-4 pt-0 border-t border-[var(--color-border)]">
          {/* Lista de confirmadas */}
          {confirmadas.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-[var(--color-fg-subtle)] pt-1">Confirmadas</p>
              {confirmadas.map((a, i) => (
                <div key={i} className="flex items-center justify-between gap-2 rounded bg-[var(--color-bg-subtle)] px-3 py-2 text-xs">
                  <span className="text-[var(--color-fg)]">
                    <span className="font-medium">{TIPO_LABELS[a.tipo]}</span>
                    {a.rede_id && <span className="text-[var(--color-fg-muted)]"> · {a.rede_id}</span>}
                    {a.loja_nome_raw && <span className="text-[var(--color-fg-subtle)]"> · {a.loja_nome_raw}</span>}
                    {a.entra && <span className="text-[var(--color-success)]"> → {fmtSlot(a.entra)}</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemove(i)}
                    className="ml-2 shrink-0 inline-flex items-center justify-center h-5 w-5 rounded text-[var(--color-fg-subtle)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 transition-colors"
                  >
                    <X size={12} weight="bold" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Seletor de modo */}
          <div className="flex gap-1.5 pt-1 flex-wrap">
            {(['texto', 'txt', 'pdf', 'manual'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => { setModo(m); resetPreviews() }}
                className={cn(
                  'text-xs px-3 py-1 rounded border transition-colors',
                  modo === m
                    ? 'border-[var(--color-border-strong)] bg-[var(--color-bg-subtle)] text-[var(--color-fg)]'
                    : 'border-[var(--color-border)] text-[var(--color-fg-muted)] hover:border-[var(--color-border-strong)]',
                )}
              >
                {m === 'texto' ? 'Mensagem de texto'
                  : m === 'txt' ? 'Arquivo .txt'
                  : m === 'pdf' ? 'PDF'
                  : 'Manual (campos)'}
              </button>
            ))}
          </div>

          {/* Input texto */}
          {modo === 'texto' && (
            <div className="space-y-2">
              <textarea
                value={texto}
                onChange={e => { setTexto(e.target.value); resetPreviews() }}
                rows={5}
                placeholder={`🚨 ALTERAÇÃO 🚨\nZona Sul Tijuca\nEntra: Carlos 432 ABC1D23\nSai: José 811 XYZ9876\nMotivo: falta`}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-3 py-2 text-xs font-mono text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:outline-none focus:border-[var(--color-border-strong)] resize-y"
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={analisarTexto}
                disabled={!texto.trim() || analisando}
              >
                {analisando ? 'Analisando…' : 'Analisar'}
              </Button>
            </div>
          )}

          {/* Input PDF */}
          {modo === 'pdf' && (
            <div className="space-y-2">
              <Input
                type="file"
                accept=".pdf"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) analisarPdf(f)
                }}
              />
              {analisando && <p className="text-xs text-[var(--color-fg-muted)]">Lendo PDF…</p>}
            </div>
          )}

          {/* T4 — Input arquivo .txt */}
          {modo === 'txt' && (
            <div className="space-y-2">
              <Input
                type="file"
                accept=".txt"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) analisarTxt(f)
                }}
              />
              <p className="text-[10px] text-[var(--color-fg-muted)]">
                Mesma estrutura da mensagem de WhatsApp. Suporta UTF-8 e UTF-16 (export Windows).
              </p>
              {analisando && <p className="text-xs text-[var(--color-fg-muted)]">Lendo arquivo…</p>}
            </div>
          )}

          {/* T3 — Formulário manual por campos */}
          {modo === 'manual' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-semibold text-[var(--color-fg-subtle)]">Tipo</span>
                  <select
                    value={manualTipo}
                    onChange={e => setManualTipo(e.target.value as AlteracaoParsed['tipo'])}
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-2 py-1.5 text-xs text-[var(--color-fg)]"
                  >
                    <option value="SUBSTITUICAO">Substituição (sai + entra)</option>
                    <option value="INCLUSAO">Inclusão (só entra)</option>
                    <option value="SWAP">Swap (troca de placa)</option>
                    <option value="COMUNICADO">Comunicado</option>
                    <option value="INFORMATIVO">Informativo</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-semibold text-[var(--color-fg-subtle)]">Rede</span>
                  <select
                    value={manualRede}
                    onChange={e => setManualRede(e.target.value)}
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-2 py-1.5 text-xs text-[var(--color-fg)]"
                  >
                    <option value="">(sem rede)</option>
                    {REDES_OPCOES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </label>
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase font-semibold text-[var(--color-fg-subtle)]">Loja / Filial (opcional)</span>
                <Input
                  value={manualLoja}
                  onChange={e => setManualLoja(e.target.value)}
                  placeholder="Ex: Assaí Bangu I Loja 55, Filial 23, Sepetiba"
                  className="text-xs"
                />
              </label>

              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-danger-soft)]/30 p-2 space-y-2">
                <span className="text-[10px] uppercase font-semibold text-[var(--color-danger)]">Sai (opcional)</span>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={manualSaiPlaca}
                    onChange={e => setManualSaiPlaca(e.target.value.toUpperCase())}
                    placeholder="Placa que sai"
                    className="text-xs font-mono"
                    maxLength={7}
                  />
                  <Input
                    value={manualSaiMotorista}
                    onChange={e => setManualSaiMotorista(e.target.value)}
                    placeholder="Motorista que sai"
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-success-soft)]/30 p-2 space-y-2">
                <span className="text-[10px] uppercase font-semibold text-[var(--color-success)]">Entra (pelo menos placa OU motorista)</span>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={manualEntraPlaca}
                    onChange={e => setManualEntraPlaca(e.target.value.toUpperCase())}
                    placeholder="Placa que entra"
                    className="text-xs font-mono"
                    maxLength={7}
                  />
                  <Input
                    value={manualEntraMotorista}
                    onChange={e => setManualEntraMotorista(e.target.value)}
                    placeholder="Motorista que entra"
                    className="text-xs"
                  />
                </div>
                <Input
                  value={manualEntraCodigo}
                  onChange={e => setManualEntraCodigo(e.target.value.replace(/[^\d]/g, ''))}
                  placeholder="Código do motorista (opcional)"
                  className="text-xs"
                  inputMode="numeric"
                />
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase font-semibold text-[var(--color-fg-subtle)]">Motivo (opcional)</span>
                <Input
                  value={manualMotivo}
                  onChange={e => setManualMotivo(e.target.value)}
                  placeholder="Ex: carro sem chave, motorista faltou"
                  className="text-xs"
                />
              </label>

              <div className="flex items-center gap-2">
                <Button size="sm" onClick={adicionarManual}>Adicionar alteração</Button>
                {sucessoManual && (
                  <span className="text-[11px] text-[var(--color-success)] animate-fade-up">
                    ✓ Adicionada — veja em "Confirmadas" acima
                  </span>
                )}
              </div>
            </div>
          )}

          {err && <p className="text-xs text-[var(--color-danger)]">{err}</p>}

          {/* Previews para confirmar/descartar */}
          {previews.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-[var(--color-fg-muted)]">
                {previews.length} alteração{previews.length !== 1 ? 'ões' : ''} identificada{previews.length !== 1 ? 's' : ''} — confirme antes de gerar
              </p>
              {previews.map((a, i) => (
                <div key={i} className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
                  <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
                    <span className="text-xs font-semibold text-[var(--color-fg)]">{TIPO_LABELS[a.tipo]}</span>
                    <span className={cn('text-xs', CONF_CLASS[a.confianca] ?? 'text-[var(--color-fg-muted)]')}>
                      confiança {a.confianca}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 px-3 py-2.5 text-xs">
                    <div><span className="text-[var(--color-fg-subtle)]">Rede </span><span className="text-[var(--color-fg)]">{a.rede_id ?? '—'}</span></div>
                    <div><span className="text-[var(--color-fg-subtle)]">Loja </span><span className="text-[var(--color-fg)]">{a.loja_nome_raw ?? '—'}</span></div>
                    <div><span className="text-[var(--color-fg-subtle)]">Entra </span><span className="text-[var(--color-success)]">{fmtSlot(a.entra)}</span></div>
                    <div><span className="text-[var(--color-fg-subtle)]">Sai </span><span className="text-[var(--color-danger)]">{fmtSlot(a.sai)}</span></div>
                    {a.motivo && (
                      <div className="col-span-2">
                        <span className="text-[var(--color-fg-subtle)]">Motivo </span>
                        <span className="text-[var(--color-fg-muted)]">{a.motivo}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 px-3 pb-3">
                    <Button size="sm" onClick={() => confirmar(a)}>Confirmar</Button>
                    <Button size="sm" variant="ghost" onClick={() => setPreviews(prev => prev.filter((_, j) => j !== i))}>
                      Descartar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function KpiSimplesPage() {
  const [escalas, setEscalas] = useState<File[]>([])
  const [unitracFiles, setUnitracFiles] = useState<File[]>([])
  const [data, setData] = useState<string>(hoje)
  const [alteracoes, setAlteracoes] = useState<AlteracaoParsed[]>([])
  const [redes, setRedes] = useState<RedeResult[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [bucketPaths, setBucketPaths] = useState<{ escalaBucketPaths: string[]; unitracBucketPaths: string[] } | null>(null)
  const [lineEdits, setLineEdits] = useState<Record<string, LineEditPatch>>({})
  const [geracaoId, setGeracaoId] = useState<string | null>(null)
  const [reabrindoGeracaoId, setReabrindoGeracaoId] = useState<string | null>(null)

  function addAlteracao(a: AlteracaoParsed) { setAlteracoes(prev => [...prev, a]) }
  function removeAlteracao(idx: number) { setAlteracoes(prev => prev.filter((_, i) => i !== idx)) }

  // Toast de sucesso — auto-dismiss após 4s
  const [showToast, setShowToast] = useState(false)
  useEffect(() => {
    if (!geracaoId) return
    setShowToast(true)
    const t = setTimeout(() => setShowToast(false), 4200)
    return () => clearTimeout(t)
  }, [geracaoId])

  // Reabrir geração salva via ?geracao=ID
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const id = params.get('geracao')
    if (!id) return
    setErro(null)
    setRedes(null)
    setReabrindoGeracaoId(id)
    startTransition(async () => {
      try {
        const res = await fetch('/api/kpi/simples/regerar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        })
        if (!res.ok) throw new Error((await res.text()) || 'Erro ao reabrir geração.')
        const json = await res.json() as { redes: RedeResult[] }
        setRedes(json.redes)
        setGeracaoId(id)
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Erro ao reabrir geração.')
      } finally {
        setReabrindoGeracaoId(null)
      }
    })
  }, [])

  function addEscalas(files: File[]) {
    if (files.length === 0) return
    setEscalas(prev => {
      const names = new Set(prev.map(f => f.name))
      return [...prev, ...files.filter(f => !names.has(f.name))]
    })
  }

  async function uploadComPresign(file: File, isUnitrac: boolean): Promise<string> {
    const endpoint = isUnitrac ? '/api/unitrac/presign' : '/api/escalas/presign'
    const body = isUnitrac
      ? { data, filename: file.name }
      : { data, filename: file.name, tipo: 'auto' }

    const presignRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!presignRes.ok) throw new Error(`Presign falhou: ${await presignRes.text()}`)
    const { signedUrl, path } = await presignRes.json() as { signedUrl: string; path: string }

    const ext = file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'xlsx'
    const contentType = ext === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

    const putRes = await fetch(signedUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file })
    if (!putRes.ok) throw new Error(`Upload falhou (${putRes.status}): ${putRes.statusText}`)
    return path
  }

  async function processar() {
    if (escalas.length === 0) { setErro('Selecione ao menos uma escala.'); return }
    if (unitracFiles.length === 0) { setErro('Selecione o Unitrac (PDF).'); return }
    // PDF é OBRIGATÓRIO (formato principal usado pela Erica).
    // XLSX é opcional como fallback.
    const temPdf = unitracFiles.some(f => f.name.toLowerCase().endsWith('.pdf'))
    if (!temPdf) {
      setErro('Suba o Unitrac em PDF (formato principal). XLSX é opcional.')
      return
    }
    if (!data) { setErro('Selecione a data.'); return }

    setErro(null)
    setRedes(null)
    setLineEdits({})

    startTransition(async () => {
      try {
        const [escalaBucketPaths, unitracBucketPaths] = await Promise.all([
          Promise.all(escalas.map(f => uploadComPresign(f, false))),
          Promise.all(unitracFiles.map(f => uploadComPresign(f, true))),
        ])

        setBucketPaths({ escalaBucketPaths, unitracBucketPaths })

        const res = await fetch('/api/kpi/simples', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ escalaBucketPaths, unitracBucketPaths, data, alteracoes }),
        })
        if (!res.ok) throw new Error((await res.text()) || 'Erro ao processar.')
        const json = await res.json() as { redes: RedeResult[]; geracao_id?: string }
        setRedes(json.redes)
        if (json.geracao_id) setGeracaoId(json.geracao_id)
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Erro inesperado.')
      }
    })
  }

  // Habilita o botão quando temos: pelo menos 1 escala + Unitrac PDF + data.
  // XLSX é opcional (fallback).
  const temUnitracPdf = unitracFiles.some(f => f.name.toLowerCase().endsWith('.pdf'))
  const pronto = escalas.length > 0 && temUnitracPdf && !!data

  function handleLineEdit(redeId: string, ordem: number, patch: LineEditPatch) {
    const key = `${redeId}:::${ordem}`
    setLineEdits(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  }

  async function regenerar() {
    if (!bucketPaths) return
    setErro(null)
    startTransition(async () => {
      try {
        const editsArr = Object.entries(lineEdits).map(([key, vals]) => {
          const sep = key.indexOf(':::')
          return { rede_id: key.slice(0, sep), ordem: parseInt(key.slice(sep + 3), 10), ...vals }
        })
        const res = await fetch('/api/kpi/simples', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...bucketPaths, data, alteracoes, lineEdits: editsArr }),
        })
        if (!res.ok) throw new Error((await res.text()) || 'Erro ao processar.')
        const json = await res.json() as { redes: RedeResult[]; geracao_id?: string }
        setRedes(json.redes)
        if (json.geracao_id) setGeracaoId(json.geracao_id)
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Erro inesperado.')
      }
    })
  }

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      {/* Saudação editorial */}
      <header className="mb-10 flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
          KPI Benassi
        </span>
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-fg)] md:text-[34px]">
          Geração Simples
        </h1>
        <p className="mt-1 max-w-[55ch] text-[14px] leading-relaxed text-[var(--color-fg-muted)]">
          Suba escalas (GERAL, PAX, ZONA SUL, GUANABARA PDF) e o relatório Unitrac.
          Em alguns segundos você recebe um XLSX e PDF por rede.
        </p>
      </header>

      {/* Banner — quando reabrindo geração salva via ?geracao=ID */}
      {reabrindoGeracaoId && (
        <div className="mb-6 flex items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-navy-700)]/30 bg-[var(--color-navy-700)]/5 px-5 py-4 animate-fade-up">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inset-0 rounded-full bg-[var(--color-navy-700)] animate-pulse-dot" />
            <span className="relative h-2 w-2 rounded-full bg-[var(--color-navy-700)]" />
          </span>
          <div className="flex flex-col">
            <span className="text-[13px] font-semibold text-[var(--color-fg)]">
              Regerando geração <span className="text-numeric text-[var(--color-navy-700)]">#{reabrindoGeracaoId.slice(0, 8)}</span>…
            </span>
            <span className="text-[11px] text-[var(--color-fg-subtle)]">
              Recarregando escalas e Unitrac do Storage. Alterações pendentes do dia são aplicadas automaticamente.
            </span>
          </div>
        </div>
      )}

      {/* Upload grid asymmetric — escalas 7/12 (mais peso) + Unitrac+data 5/12 */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <FileDropzone
          className="col-span-1 lg:col-span-7"
          eyebrow="Passo 1"
          label="Escalas do dia"
          hint="XLSX ou PDF · pode subir várias"
          accept=".xlsx,.pdf"
          multiple
          files={escalas}
          onAdd={addEscalas}
          onRemove={i => setEscalas(prev => prev.filter((_, j) => j !== i))}
        />

        <div className="col-span-1 flex flex-col gap-4 lg:col-span-5">
          <FileDropzone
            eyebrow="Passo 2"
            label="Relatório Unitrac"
            hint="XLSX e/ou PDF · múltiplos permitidos"
            accept=".xlsx,.pdf"
            files={unitracFiles}
            onAdd={files => setUnitracFiles(prev => [...prev, ...files])}
            onRemove={idx => setUnitracFiles(prev => prev.filter((_, i) => i !== idx))}
          />

          <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5">
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
              <CalendarBlank size={12} weight="bold" />
              Passo 3 · Data de referência
            </div>
            <input
              id="data"
              type="date"
              value={data}
              onChange={e => setData(e.target.value)}
              className="mt-1 w-full bg-transparent text-[24px] font-medium tracking-tight text-[var(--color-fg)] outline-none [color-scheme:light] dark:[color-scheme:dark]"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </div>
        </div>
      </section>

      {/* Alterações (componente preservado) */}
      <div className="mt-6">
        <AlteracoesCard confirmadas={alteracoes} onConfirm={addAlteracao} onRemove={removeAlteracao} data={data} />
      </div>

      {/* Error inline */}
      {erro && (
        <div className="mt-6 flex items-start gap-3 rounded-[var(--radius-card)] border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] px-5 py-4">
          <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-[var(--color-danger)]" />
          <p className="text-[13px] leading-relaxed text-[var(--color-danger-soft-fg)]">{erro}</p>
        </div>
      )}

      {/* CTA hero — botão grande tactile com progress sweep durante pending */}
      <button
        type="button"
        onClick={processar}
        disabled={pending || !pronto}
        className={cn(
          'group relative mt-8 flex w-full items-center justify-between gap-4 overflow-hidden rounded-[var(--radius-card)] px-7 py-5 text-left transition-all duration-200 active:scale-[0.997]',
          pronto && !pending
            ? 'bg-[var(--color-navy-700)] text-white hover:opacity-90'
            : pending
              ? 'bg-[var(--color-navy-700)] text-white'
              : 'cursor-not-allowed bg-[var(--color-bg-subtle)] border border-[var(--color-border)] text-[var(--color-fg-muted)]'
        )}
      >
        {/* Progress sweep band — só durante pending */}
        {pending && (
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-0 left-0 h-[3px] w-1/4 bg-white/80 animate-progress-sweep"
            style={{ filter: 'blur(0.3px)' }}
          />
        )}
        <div className="flex flex-col gap-1">
          <span
            className={cn(
              'text-[11px] font-medium uppercase tracking-[0.18em]',
              pronto || pending
                ? 'text-white/60'
                : 'text-[var(--color-fg-muted)]'
            )}
          >
            {pending ? 'Processando' : 'Gerar KPIs'}
          </span>
          <span className="text-[18px] font-semibold tracking-tight">
            {pending
              ? 'Cruzando escala com Unitrac…'
              : pronto
                ? `Gerar agora${escalas.length > 1 ? ` · ${escalas.length} escalas` : ''}${alteracoes.length > 0 ? ` · ${alteracoes.length} alt.` : ''}`
                : 'Aguardando arquivos'}
          </span>
        </div>
        {!pending && pronto && (
          <ArrowRight
            size={22}
            weight="bold"
            className="shrink-0 transition-transform duration-200 group-hover:translate-x-1"
          />
        )}
        {pending && (
          <span className="flex items-center gap-1.5" aria-hidden>
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse-dot" style={{ animationDelay: '0ms' }} />
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse-dot" style={{ animationDelay: '180ms' }} />
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse-dot" style={{ animationDelay: '360ms' }} />
          </span>
        )}
      </button>

      {/* Skeleton state — durante pending, mostra placeholder das redes */}
      {pending && (
        <div className="mt-12 space-y-4 animate-fade-up">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5"
              style={{ animationDelay: `${i * 120}ms` }}
            >
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-2">
                  <div className="h-3 w-24 rounded animate-shimmer" />
                  <div className="h-2 w-40 rounded animate-shimmer" />
                </div>
                <div className="h-7 w-20 rounded-md animate-shimmer" />
              </div>
              <div className="mt-4 h-px bg-[var(--color-border)]" />
              <div className="mt-3 space-y-2">
                {[0, 1, 2].map(j => (
                  <div key={j} className="h-7 rounded animate-shimmer" style={{ animationDelay: `${j * 60}ms` }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty result */}
      {redes && redes.length === 0 && (
        <div className="mt-8 flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-6 py-12 text-center">
          <ChartBarHorizontal size={28} weight="bold" className="text-[var(--color-fg-subtle)]" />
          <p className="text-[14px] text-[var(--color-fg-muted)]">
            Nenhuma rede encontrada. Verifique os arquivos enviados.
          </p>
        </div>
      )}

      {/* Resultado — preview completo por rede */}
      {redes && redes.length > 0 && (
        <section className="mt-12 space-y-8">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
                Pré-visualização KPI
              </span>
              <h2 className="text-[20px] font-semibold tracking-tight text-[var(--color-fg)]">
                {redes.length} rede{redes.length === 1 ? '' : 's'} processada{redes.length === 1 ? '' : 's'}
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-numeric text-[11px] text-[var(--color-fg-subtle)]">{data}</span>
              {bucketPaths && Object.keys(lineEdits).length > 0 && (
                <button
                  type="button"
                  onClick={regenerar}
                  disabled={pending}
                  className="group relative inline-flex items-center gap-2 rounded-md bg-[var(--color-navy-700)] px-3.5 py-2 text-[12px] font-semibold text-white transition-all duration-200 hover:opacity-90 disabled:opacity-50 active:scale-[0.97]"
                >
                  <span className="relative flex h-1.5 w-1.5 shrink-0" aria-hidden>
                    <span className="absolute inset-0 rounded-full bg-white animate-pulse-dot" />
                    <span className="relative h-1.5 w-1.5 rounded-full bg-white" />
                  </span>
                  <ArrowClockwise size={13} weight="bold" className="transition-transform duration-300 group-hover:rotate-90" />
                  Re-gerar · {Object.keys(lineEdits).length} edit{Object.keys(lineEdits).length !== 1 ? 's' : ''}
                </button>
              )}
            </div>
          </div>

          {redes.map((r, idx) => (
            <div
              key={r.rede_id}
              className="animate-fade-up"
              style={{ animationDelay: `${idx * 80}ms` }}
            >
              <RedePreviewSection
                rede={r}
                data={data}
                lineEdits={lineEdits}
                onLineEdit={handleLineEdit}
              />
            </div>
          ))}
        </section>
      )}

      {/* Toast de sucesso — slide-in bottom-right, auto-dismiss 4s */}
      {showToast && geracaoId && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-success)]/30 bg-[var(--color-bg-elevated)] px-4 py-3 shadow-diffusion animate-slide-in-br max-w-[360px]"
        >
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inset-0 rounded-full bg-[var(--color-success)] animate-pulse-dot" />
            <span className="relative h-2 w-2 rounded-full bg-[var(--color-success)]" />
          </span>
          <div className="flex flex-col">
            <span className="text-[12px] font-semibold text-[var(--color-fg)]">
              Geração salva no histórico
            </span>
            <span className="text-numeric text-[10.5px] text-[var(--color-fg-subtle)]">
              #{geracaoId.slice(0, 8)} · {redes?.length ?? 0} rede{redes?.length === 1 ? '' : 's'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowToast(false)}
            aria-label="Fechar"
            className="ml-2 text-[var(--color-fg-subtle)] transition-colors hover:text-[var(--color-fg)]"
          >
            <X size={12} weight="bold" />
          </button>
        </div>
      )}
    </div>
  )
}

// ─── File dropzone ──────────────────────────────────────────────────────────

interface FileDropzoneProps {
  className?: string
  eyebrow: string
  label: string
  hint: string
  accept: string
  multiple?: boolean
  files: File[]
  onAdd: (files: File[]) => void
  onRemove: (idx: number) => void
}

function FileDropzone({ className, eyebrow, label, hint, accept, multiple, files, onAdd, onRemove }: FileDropzoneProps) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const dropped = Array.from(e.dataTransfer.files)
    if (dropped.length > 0) onAdd(dropped)
  }, [onAdd])

  const hasFiles = files.length > 0

  return (
    <div className={className}>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'group relative flex min-h-[170px] cursor-pointer flex-col justify-between gap-4 overflow-hidden rounded-[var(--radius-card)] border border-dashed bg-[var(--color-bg-elevated)] p-5 transition-all duration-200',
          dragging
            ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]/40'
            : 'border-[var(--color-border-strong)] hover:border-[var(--color-fg-muted)]'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={e => {
            const picked = Array.from(e.target.files ?? [])
            if (picked.length > 0) onAdd(picked)
            e.target.value = ''
          }}
        />

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
              <UploadSimple size={12} weight="bold" />
              {eyebrow}
            </div>
            <h3 className="mt-2 text-[18px] font-semibold tracking-tight text-[var(--color-fg)]">{label}</h3>
            <p className="mt-0.5 text-[12px] text-[var(--color-fg-muted)]">{hint}</p>
          </div>
          {!hasFiles && (
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-fg-muted)] transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:text-[var(--color-fg)]">
              <UploadSimple size={16} weight="bold" />
            </span>
          )}
        </div>

        {!hasFiles && (
          <p className="text-[12px] italic text-[var(--color-fg-subtle)]">
            Arraste o arquivo aqui ou clique para escolher
          </p>
        )}

        {hasFiles && (
          <ul className="flex flex-col gap-1.5">
            {files.map((f, i) => (
              <li
                key={f.name + i}
                onClick={e => e.stopPropagation()}
                className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2"
              >
                {f.name.toLowerCase().endsWith('.pdf') ? (
                  <FilePdf size={16} weight="bold" className="shrink-0 text-[var(--color-danger)]" />
                ) : (
                  <FileXls size={16} weight="bold" className="shrink-0 text-[var(--color-success)]" />
                )}
                <span className="flex-1 truncate text-[12.5px] font-medium text-[var(--color-fg)]">
                  {f.name}
                </span>
                <span className="text-numeric text-[11px] text-[var(--color-fg-subtle)]">
                  {(f.size / 1024).toFixed(0)} KB
                </span>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); onRemove(i) }}
                  aria-label={`Remover ${f.name}`}
                  className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-fg-subtle)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-danger)]"
                >
                  <X size={12} weight="bold" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ─── Rede preview section ────────────────────────────────────────────────────


function RedePreviewSection({
  rede,
  data,
  lineEdits,
  onLineEdit,
}: {
  rede: RedeResult
  data: string
  lineEdits: Record<string, LineEditPatch>
  onLineEdit: (redeId: string, ordem: number, patch: LineEditPatch) => void
}) {
  const cobertura = rede.qtd_rotas > 0
    ? Math.round(((rede.qtd_rotas - rede.qtd_sem_gps) / rede.qtd_rotas) * 100)
    : 0
  const tomCobertura =
    cobertura >= 80 ? 'success' : cobertura >= 50 ? 'warning' : 'danger'
  const qtdHigh = rede.preview.filter(l => l.confianca === 'HIGH').length
  const qtdLow = rede.preview.filter(l => l.confianca === 'LOW').length
  const qtdUnmatched = rede.preview.filter(l => l.confianca === 'UNMATCHED').length

  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
      {/* Header da rede */}
      <div className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold tracking-tight text-[var(--color-fg)]">
              {rede.rede_nome}
            </h3>
            <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--color-fg-subtle)]">
              {rede.qtd_rotas} rota{rede.qtd_rotas !== 1 ? 's' : ''} · GPS{' '}
              <span
                className={cn(
                  'text-numeric',
                  tomCobertura === 'success' && 'text-[var(--color-success)]',
                  tomCobertura === 'warning' && 'text-[var(--color-warning)]',
                  tomCobertura === 'danger' && 'text-[var(--color-danger)]',
                )}
              >
                {cobertura}%
              </span>
              {rede.qtd_sem_gps > 0 && (
                <span className="text-[var(--color-fg-subtle)]"> · {rede.qtd_sem_gps} sem dado</span>
              )}
              {(qtdLow > 0 || qtdUnmatched > 0) && (
                <>
                  <span className="text-[var(--color-fg-subtle)]"> · </span>
                  <span className="text-[var(--color-success)] text-numeric">{qtdHigh}H</span>
                  {qtdLow > 0 && <span className="text-[var(--color-warning)] text-numeric ml-1">{qtdLow}L</span>}
                  {qtdUnmatched > 0 && <span className="text-[var(--color-danger)] text-numeric ml-1">{qtdUnmatched}?</span>}
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {tomCobertura === 'success' && <CheckCircle size={16} weight="fill" className="text-[var(--color-success)]" />}
          {tomCobertura !== 'success' && <WarningCircle size={16} weight="fill" className={tomCobertura === 'warning' ? 'text-[var(--color-warning)]' : 'text-[var(--color-danger)]'} />}
          <button
            type="button"
            onClick={() => downloadBase64(rede.xlsxBase64, `KPI-${rede.rede_id}-${data}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--color-fg)] transition-all duration-150 active:scale-[0.96] hover:border-[var(--color-navy-700)] hover:bg-[var(--color-navy-700)] hover:text-white"
          >
            <FileArrowDown size={12} weight="bold" />
            <FileXls size={12} weight="bold" />
            XLSX
          </button>
          <button
            type="button"
            onClick={() => downloadBase64(rede.pdfBase64, `KPI-${rede.rede_id}-${data}.pdf`, 'application/pdf')}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--color-fg)] transition-all duration-150 active:scale-[0.96] hover:border-[var(--color-navy-700)] hover:bg-[var(--color-navy-700)] hover:text-white"
          >
            <FileArrowDown size={12} weight="bold" />
            <FilePdf size={12} weight="bold" />
            PDF
          </button>
        </div>
      </div>

      {/* Barra de cobertura */}
      <div className="h-[2px] bg-[var(--color-bg-subtle)]">
        <div
          className={cn(
            'h-full transition-all duration-700',
            tomCobertura === 'success' && 'bg-[var(--color-success)]',
            tomCobertura === 'warning' && 'bg-[var(--color-warning)]',
            tomCobertura === 'danger' && 'bg-[var(--color-danger)]',
          )}
          style={{ width: `${cobertura}%` }}
        />
      </div>

      {/* Tabela de preview */}
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)]">
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)] w-8">#</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">Loja</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">Placa</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)] hidden sm:table-cell">Motorista</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)] hidden lg:table-cell w-20">Turno</th>
              <th className="px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)] w-14">GPS</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)] hidden md:table-cell">Saída CD</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)] hidden md:table-cell">Ch. Loja</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)] hidden lg:table-cell w-20">Tempo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {rede.preview.map(linha => (
              <PreviewRow
                key={linha.ordem}
                linha={linha}
                editValues={lineEdits[`${rede.rede_id}:::${linha.ordem}`] ?? {}}
                onEdit={(patch) => onLineEdit(rede.rede_id, linha.ordem, patch)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PreviewRow({
  linha,
  editValues,
  onEdit,
}: {
  linha: PreviewLinha
  editValues: LineEditPatch
  onEdit: (patch: LineEditPatch) => void
}) {
  const semGps = !linha.tem_gps
  const temAnomaliaHigh = linha.anomalias.some(c => ['ANOM-01','ANOM-04','ANOM-06','ANOM-07'].includes(c))
  const placaDisplay = linha.placa ? `${linha.placa.slice(0, 3)}-${linha.placa.slice(3)}` : ''

  const cellInput =
    'w-full bg-transparent text-[12px] outline-none border-b border-transparent hover:border-[var(--color-border)] focus:border-[var(--color-navy-700)] transition-colors duration-100 rounded-none placeholder:text-[var(--color-fg-subtle)]'
  const monoCell = cellInput + ' text-numeric tracking-wider'

  return (
    <tr
      className={cn(
        'transition-colors duration-100',
        temAnomaliaHigh
          ? 'bg-[var(--color-danger-soft)]/60 hover:bg-[var(--color-danger-soft)]'
          : semGps
          ? 'bg-[var(--color-warning-soft)]/40 hover:bg-[var(--color-warning-soft)]/60'
          : 'hover:bg-[var(--color-bg-hover)]',
      )}
      title={linha.anomalias.length > 0 ? `Anomalias: ${linha.anomalias.join(', ')}` : undefined}
    >
      <td className="px-4 py-2 text-numeric text-[var(--color-fg-subtle)] relative">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            title={linha.confianca === 'HIGH' ? `Match alta confiança via ${linha.algoritmo}` : linha.confianca === 'LOW' ? `Match baixa confiança via ${linha.algoritmo}` : 'Sem match GPS'}
            className={cn(
              'h-1.5 w-1.5 shrink-0 rounded-full',
              linha.confianca === 'HIGH' && 'bg-[var(--color-success)]',
              linha.confianca === 'LOW' && 'bg-[var(--color-warning)]',
              linha.confianca === 'UNMATCHED' && 'bg-[var(--color-danger)] animate-pulse-dot',
            )}
          />
          {linha.ordem}
        </span>
      </td>
      <td className="px-4 py-2 font-medium text-[var(--color-fg)] max-w-[220px]">
        <input
          type="text"
          value={editValues.loja ?? linha.loja_nome}
          onChange={e => onEdit({ loja: e.target.value })}
          placeholder="Loja"
          className={cn(cellInput, 'font-medium text-[var(--color-fg)] truncate')}
        />
      </td>
      <td className="px-4 py-2">
        <input
          type="text"
          value={editValues.placa ?? placaDisplay}
          onChange={e => onEdit({ placa: e.target.value.toUpperCase() })}
          placeholder="—"
          spellCheck={false}
          maxLength={8}
          className={cn(monoCell, 'w-[88px] font-mono')}
        />
      </td>
      <td className="px-4 py-2 text-[var(--color-fg-muted)] hidden sm:table-cell max-w-[160px]">
        <input
          type="text"
          value={editValues.motorista ?? (linha.motorista ?? '')}
          onChange={e => onEdit({ motorista: e.target.value })}
          placeholder="Motorista"
          className={cn(cellInput, 'max-w-[140px] truncate')}
        />
      </td>
      <td className="px-4 py-2 hidden lg:table-cell">
        <input
          type="text"
          value={editValues.turno ?? linha.turno}
          onChange={e => onEdit({ turno: e.target.value })}
          placeholder="—"
          className={cn(cellInput, 'w-[72px] text-[var(--color-fg-muted)] uppercase tracking-wider')}
        />
      </td>
      <td className="px-4 py-2 text-center">
        {linha.tem_gps
          ? <WifiHigh size={14} weight="bold" className="mx-auto text-[var(--color-success)]" />
          : <WifiSlash size={14} weight="bold" className="mx-auto text-[var(--color-danger)]" />}
      </td>
      <td className="px-4 py-2 hidden md:table-cell">
        <input
          type="text"
          value={editValues.saida_cd ?? (linha.saida_cd_fmt ?? '')}
          onChange={e => onEdit({ saida_cd: e.target.value })}
          placeholder="HH:MM"
          inputMode="numeric"
          pattern="\d{1,2}:\d{2}"
          className={cn(monoCell, 'w-[64px] text-[var(--color-fg-muted)]')}
        />
      </td>
      <td className="px-4 py-2 hidden md:table-cell">
        <input
          type="text"
          value={editValues.chegada_loja ?? (linha.chegada_loja_fmt ?? '')}
          onChange={e => onEdit({ chegada_loja: e.target.value })}
          placeholder="HH:MM"
          inputMode="numeric"
          pattern="\d{1,2}:\d{2}"
          className={cn(monoCell, 'w-[64px] text-[var(--color-fg-muted)]')}
        />
      </td>
      <td className="px-4 py-2 hidden lg:table-cell text-right">
        <input
          type="text"
          inputMode="numeric"
          value={editValues.tempo_loja_min !== undefined
            ? (editValues.tempo_loja_min ?? '')
            : (linha.tempo_loja_min ?? '')}
          onChange={e => {
            const raw = e.target.value.replace(/[^\d]/g, '')
            onEdit({ tempo_loja_min: raw === '' ? null : Number(raw) })
          }}
          placeholder="—"
          className={cn(monoCell, 'w-[56px] text-right text-[var(--color-fg-muted)]')}
        />
      </td>
    </tr>
  )
}
