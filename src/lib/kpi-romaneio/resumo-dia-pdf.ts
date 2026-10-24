// F3-02 (ACH-03): "Baixar PDF" do Resumo do dia -- as mesmas seções do texto
// (secoesResumoDia), A4 retrato, fonte padrão. Só gera o arquivo: nada é
// enviado a ninguém.
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib'
import { secoesResumoDia, type ResumoDia } from './resumo-dia'

const W = 595.28, H = 841.89, MX = 44, MT = 52, MB = 48
const NAVY = rgb(0.122, 0.22, 0.392)
const INK = rgb(0.06, 0.09, 0.16)
const MUTED = rgb(0.4, 0.45, 0.52)

const TROCAS: Record<string, string> = { '—': '-', '–': '-', '’': "'", '‘': "'", '“': '"', '”': '"', '…': '...', '›': '>', '≥': '>=', '÷': '/' }
/** A fonte padrão do PDF é WinAnsi: o que não cabe nela vira equivalente. */
export const textoSeguroPdf = (s: string) => s.replace(/[^\x00-\xFF]/g, c => TROCAS[c] ?? '?')

function quebrar(texto: string, fonte: PDFFont, tam: number, largura: number): string[] {
  const linhas: string[] = []
  let atual = ''
  for (const palavra of texto.split(/\s+/)) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra
    if (fonte.widthOfTextAtSize(tentativa, tam) <= largura || !atual) atual = tentativa
    else { linhas.push(atual); atual = palavra }
  }
  if (atual) linhas.push(atual)
  return linhas
}

export async function gerarPdfResumoDia(r: ResumoDia, nomeCliente: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(textoSeguroPdf(`Resumo do dia - ${nomeCliente} - ${r.data}`))
  const normal = await doc.embedFont(StandardFonts.Helvetica)
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold)
  let pagina = doc.addPage([W, H])
  let y = H - MT
  const garantir = (altura: number) => { if (y - altura < MB) { pagina = doc.addPage([W, H]); y = H - MT } }
  const escrever = (texto: string, o: { fonte?: PDFFont; tam?: number; cor?: ReturnType<typeof rgb>; recuo?: number; antes?: number } = {}) => {
    const fonte = o.fonte ?? normal, tam = o.tam ?? 10.5, recuo = o.recuo ?? 0
    y -= o.antes ?? 0
    for (const l of quebrar(textoSeguroPdf(texto), fonte, tam, W - 2 * MX - recuo)) {
      garantir(tam * 1.45)
      pagina.drawText(l, { x: MX + recuo, y: y - tam, size: tam, font: fonte, color: o.cor ?? INK })
      y -= tam * 1.45
    }
  }
  const [a, m, d] = r.data.split('-')
  escrever(`Resumo do dia - ${nomeCliente} - ${d}/${m}/${a}${r.parcial ? ' (parcial)' : ''}`, { fonte: negrito, tam: 16, cor: NAVY })
  escrever(`Montado por regra a partir do KPI calculado em ${new Date(r.calculadoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.`, { tam: 9, cor: MUTED, antes: 2 })
  for (const s of secoesResumoDia(r)) {
    if (s.titulo === 'Conferir primeiro') continue
    escrever(s.titulo, { fonte: negrito, tam: 12, cor: NAVY, antes: 10 })
    for (const l of s.linhas) {
      const sub = l.startsWith('  ')
      escrever(sub ? l.trim() : `- ${l}`, { recuo: sub ? 14 : 0, antes: 1 })
    }
  }
  return doc.save()
}
