// Romaneio e pão subidos no Ao vivo vão sozinhos pro Monitoramento (06/10):
// mesmo arquivo, sem a operação subir duas vezes. Servidor a servidor, com a
// chave das rotas de ponte (x-motor-key). Falha não atrapalha o Ao vivo --
// só volta o motivo pra tela mostrar.
export type ArquivoMonitoramento = { buf: Buffer; nome: string; origem: 'romaneio' | 'escala_pao' }
export type EnvioMonitoramento = { origem: 'romaneio' | 'escala_pao'; ok: boolean; linhas?: number; erro?: string }

export async function enviarAoMonitoramento(arquivos: ArquivoMonitoramento[], enviadoPor: string | null): Promise<EnvioMonitoramento[]> {
  const base = process.env.MONITORAMENTO_URL ?? 'http://127.0.0.1:3010'
  const chave = process.env.MOTOR_SECRET
  if (!chave) return arquivos.map(a => ({ origem: a.origem, ok: false, erro: 'MOTOR_SECRET ausente' }))
  return Promise.all(arquivos.map(async a => {
    try {
      const fd = new FormData()
      fd.set('arquivo', new Blob([new Uint8Array(a.buf)], { type: 'application/pdf' }), a.nome)
      fd.set('origem', a.origem)
      fd.set('modoTeste', 'false')
      const r = await fetch(`${base}/api/romaneio/upload`, {
        method: 'POST', body: fd, headers: { 'x-motor-key': chave, 'x-enviado-por': enviadoPor ?? 'KPI' },
        signal: AbortSignal.timeout(90_000),
      })
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; totalLinhas?: number; erro?: string }
      return j.ok ? { origem: a.origem, ok: true, linhas: j.totalLinhas } : { origem: a.origem, ok: false, erro: j.erro ?? `HTTP ${r.status}` }
    } catch (err) {
      return { origem: a.origem, ok: false, erro: err instanceof Error ? err.message : String(err) }
    }
  }))
}
