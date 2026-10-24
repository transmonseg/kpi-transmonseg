// F3-03 (D-07): comprovante da conferência (canhoto ou foto). Fica no mesmo
// bucket privado que o KPI já usa para os arquivos do dia
// (kpi-romaneio-inputs), na pasta comprovantes/<cliente>/<data>/. Sem imports
// de servidor: a tela confere o arquivo antes de enviar.

/** Abaixo do limite de 10 MB que o proxy do Next guarda do corpo. */
export const COMPROVANTE_MAX_BYTES = 8 * 1024 * 1024

export const TIPOS_COMPROVANTE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
}
export const ACCEPT_COMPROVANTE = Object.keys(TIPOS_COMPROVANTE).join(',')

/** Extensão -> tipo (o download devolve com o tipo certo). */
export const TIPO_POR_EXTENSAO: Record<string, string> = Object.fromEntries(Object.entries(TIPOS_COMPROVANTE).map(([t, e]) => [e, t]))

export function validarComprovante(f: { type: string; size: number }): { ok: true; extensao: string } | { ok: false; erro: string } {
  const extensao = TIPOS_COMPROVANTE[f.type]
  if (!extensao) return { ok: false, erro: 'O comprovante tem que ser foto (JPG, PNG, WEBP, HEIC) ou PDF.' }
  if (f.size <= 0) return { ok: false, erro: 'O arquivo do comprovante está vazio.' }
  if (f.size > COMPROVANTE_MAX_BYTES) return { ok: false, erro: 'O comprovante passa de 8 MB. Tire a foto de novo ou mande um PDF menor.' }
  return { ok: true, extensao }
}

export function caminhoComprovante(cliente: string, data: string, nf: string, extensao: string, agoraMs: number, sufixo: string): string {
  const nfSegura = nf.replace(/[^0-9A-Za-z_-]/g, '_').slice(0, 40) || 'nf'
  return `comprovantes/${cliente}/${data}/${nfSegura}-${agoraMs}-${sufixo}.${extensao}`
}
