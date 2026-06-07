// Geração OFFLINE para o app desktop: recebe os arquivos da tela real (como
// bytes), roda `gerarKpiLocalComPreview` (mesmo motor/regra do site) e devolve o
// MESMO formato `RedeResult[]` que a página `painel/kpi/simples` já renderiza —
// base64 dos XLSX/PDF + preview por linha.
import {
  gerarKpiLocalComPreview,
  type CadastroLocal,
  type PreviewLinhaLocal,
} from '@/lib/kpi/gerar-kpi-local'
import { parsedToConfirmada } from '@/lib/kpi/aplicar-alteracoes'

export type ArquivoBytes = { nome: string; bytes: Uint8Array }

/** Alteração confirmada no formato da tela (`AlteracaoParsed`). Convertida aqui. */
export type AlteracaoParsedLike = {
  tipo: string
  rede_id: string | null
  loja_nome_raw: string | null
  motivo?: string | null
  carro?: number | null
  entra: { motorista_nome: string | null; motorista_codigo: number | null; placa_raw: string | null; placa_norm: string | null } | null
  sai: { motorista_nome: string | null; placa_norm: string | null } | null
}

export type GerarOfflineReq = {
  escalas: ArquivoBytes[]
  unitracs: ArquivoBytes[]
  data: string
  alteracoes?: AlteracaoParsedLike[]
}

/** Espelha o `RedeResult` consumido pela tela (base64 + preview). */
export type RedeResultOffline = {
  rede_id: string
  rede_nome: string
  qtd_rotas: number
  qtd_sem_gps: number
  avisoParcial: string | null
  xlsxBase64: string
  xlsxComChegadaBase64: string
  pdfBase64: string
  pdfComChegadaBase64: string
  preview: PreviewLinhaLocal[]
}

export async function gerarKpiLocalPreview(
  req: GerarOfflineReq,
  cadastro: CadastroLocal,
): Promise<RedeResultOffline[]> {
  if (!req.escalas?.length) throw new Error('Selecione ao menos uma escala.')
  if (!req.unitracs?.length) throw new Error('Selecione o relatório Unitrac.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.data || '')) throw new Error('Data inválida (use AAAA-MM-DD).')

  const toBuf = (a: ArquivoBytes) => ({ nome: a.nome, buffer: Buffer.from(a.bytes) })
  const saidas = await gerarKpiLocalComPreview({
    escalas: req.escalas.map(toBuf),
    unitracs: req.unitracs.map(toBuf),
    cadastro,
    data: req.data,
    alteracoes: (req.alteracoes ?? []).map(parsedToConfirmada),
  })

  return saidas.map((s) => ({
    rede_id: s.rede_id,
    rede_nome: s.rede_nome,
    qtd_rotas: s.linhas,
    qtd_sem_gps: s.qtd_sem_gps,
    avisoParcial: s.avisoParcial,
    xlsxBase64: s.xlsx.toString('base64'),
    xlsxComChegadaBase64: s.xlsx_com_cd.toString('base64'),
    pdfBase64: s.pdf.toString('base64'),
    pdfComChegadaBase64: s.pdf_com_cd.toString('base64'),
    preview: s.preview,
  }))
}
