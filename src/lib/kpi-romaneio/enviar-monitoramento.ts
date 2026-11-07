// Romaneio e pão subidos no Ao vivo vão sozinhos pro Monitoramento (06/10):
// mesmo arquivo, sem a operação subir duas vezes. Servidor a servidor, com a
// chave das rotas de ponte (x-motor-key). Falha não atrapalha o Ao vivo --
// só volta o motivo pra tela mostrar.
import { coordenadasConfiaveisDoCache } from './geocode'
import type { LinhaRomaneio } from './types'

/** GEO3-08 (auditoria 03/11): ponto confiavel que o KPI ja' resolveu, por NF. */
export type CoordenadaNfMonitoramento = { placa: string; nf: string; lat: number; lng: number }
export type ArquivoMonitoramento = { buf: Buffer; nome: string; origem: 'romaneio' | 'escala_pao'; coordenadas?: CoordenadaNfMonitoramento[] }

/** GEO3-08: o ponto da Nutry no monitoramento divergia do KPI (44% a mais de
 *  150 m). Mesmo padrao da RQ (linhasComCoordenadasRQ): so' ponto confiavel e
 *  com fonte do cache do KPI, sem rede. Fail-open: sem cache, vai sem. */
export async function coordenadasNutryParaMonitoramento(romaneio: LinhaRomaneio[]): Promise<CoordenadaNfMonitoramento[]> {
  const coords = await coordenadasConfiaveisDoCache(romaneio.map(l => l.endereco)).catch(() => new Map<string, { lat: number; lng: number }>())
  const out: CoordenadaNfMonitoramento[] = []
  for (const l of romaneio) {
    const c = coords.get(l.endereco)
    if (c && l.placa && l.nf) out.push({ placa: l.placa, nf: l.nf, lat: c.lat, lng: c.lng })
  }
  return out
}
export type EnvioMonitoramento = { origem: 'romaneio' | 'escala_pao'; ok: boolean; linhas?: number; erro?: string }

/** `romaneio` (GEO3-08): linhas do dia -- o PDF do romaneio vai com o ponto
 *  confiavel do KPI por NF (coordenadasNutryParaMonitoramento). */
export async function enviarAoMonitoramento(arquivos: ArquivoMonitoramento[], enviadoPor: string | null, romaneio?: LinhaRomaneio[], pao?: LinhaRomaneio[]): Promise<EnvioMonitoramento[]> {
  // 07/11: o pão também leva o ponto do KPI. Sem ele o monitoramento
  // geocodificava sozinho e errava bairro de fora da capital (Feira Nova
  // Coelho da Rocha, NF 218095, 05/11: ponto no Recreio, 19 km da loja).
  const linhasPorOrigem = { romaneio, escala_pao: pao }
  for (const origem of ['romaneio', 'escala_pao'] as const) {
    const linhas = linhasPorOrigem[origem]
    if (!linhas?.length || !arquivos.some(a => a.origem === origem && !a.coordenadas)) continue
    const coordenadas = await coordenadasNutryParaMonitoramento(linhas)
    arquivos = arquivos.map(a => (a.origem === origem && !a.coordenadas ? { ...a, coordenadas } : a))
  }
  const base = process.env.MONITORAMENTO_URL ?? 'http://127.0.0.1:3010'
  const chave = process.env.MOTOR_SECRET
  if (!chave) return arquivos.map(a => ({ origem: a.origem, ok: false, erro: 'MOTOR_SECRET ausente' }))
  return Promise.all(arquivos.map(async a => {
    try {
      const fd = new FormData()
      fd.set('arquivo', new Blob([new Uint8Array(a.buf)], { type: 'application/pdf' }), a.nome)
      fd.set('origem', a.origem)
      fd.set('modoTeste', 'false')
      // GEO3-08: o monitoramento antigo ignora o campo e geocodifica como antes.
      if (a.coordenadas?.length) fd.set('coordenadas', JSON.stringify(a.coordenadas))
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
