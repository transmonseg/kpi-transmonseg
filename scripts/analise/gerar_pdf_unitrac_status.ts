/**
 * Gera PDF do relatório ESCALA × UNITRAC com aviso explícito que é ESTIMATIVA.
 * Lê o MD existente e converte pra HTML estilizado + Chrome headless → PDF.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { execSync } from 'child_process'

const MD_PATH = 'docs/conversas-tia-erica/ESCALA-VS-UNITRAC-V2.md'
const HTML_PATH = 'docs/conversas-tia-erica/ESCALA-VS-UNITRAC-V2.html'
const PDF_PATH = 'docs/conversas-tia-erica/ESCALA-VS-UNITRAC-V2.pdf'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const md = readFileSync(MD_PATH, 'utf-8')

// Conversão simples markdown → HTML
function mdToHtml(md: string): string {
  let html = md
    // tabelas
    .replace(/^\|(.+)\|$/gm, (line) => {
      const cells = line.slice(1, -1).split('|').map(c => c.trim())
      if (cells.every(c => /^-+$/.test(c) || /^:?-+:?$/.test(c))) return '__SEP__'
      return `<tr>${cells.map(c => {
        // bold
        const html = c.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        return `<td>${html}</td>`
      }).join('')}</tr>`
    })
    // headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // listas
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    // quebras
    .replace(/\n\n/g, '</p><p>')

  // Envolve tabelas
  html = html.replace(/(<tr>[\s\S]*?<\/tr>(?:\s*__SEP__)?(?:\s*<tr>[\s\S]*?<\/tr>)*)/g, (m) => {
    return `<table><tbody>${m.replace(/__SEP__/g, '').replace(/<tr>(<td>[^<]+<\/td>)+<\/tr>/, (h) => h.replace(/<td>/g, '<th>').replace(/<\/td>/g, '</th>'))}</tbody></table>`
  })

  return `<p>${html}</p>`
}

const htmlBody = mdToHtml(md)

const html = `<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="UTF-8">
<title>Análise Cadastro Unitrac — Estimativa</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9.5pt; color: #222; line-height: 1.4; }
  .aviso {
    background: #fff4e0;
    border-left: 5px solid #ff9500;
    padding: 14px 18px;
    margin-bottom: 18px;
    border-radius: 4px;
  }
  .aviso strong { color: #b04400; }
  h1 { color: #1a3a52; font-size: 18pt; margin-bottom: 4px; border-bottom: 2px solid #1a3a52; padding-bottom: 6px; }
  h2 { color: #205070; font-size: 13pt; margin-top: 18px; margin-bottom: 6px; border-bottom: 1px solid #ddd; padding-bottom: 3px; }
  h3 { color: #2a6080; font-size: 11pt; margin-top: 12px; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 14px 0; font-size: 8.5pt; page-break-inside: avoid; }
  th { background: #1a3a52; color: white; padding: 5px 8px; text-align: left; border: 1px solid #1a3a52; }
  td { padding: 4px 8px; border: 1px solid #ddd; vertical-align: top; }
  tr:nth-child(even) td { background: #f7f9fb; }
  strong { color: #1a3a52; }
  li { margin-left: 16px; margin-bottom: 3px; }
  p { margin: 6px 0; }
  .rodape { margin-top: 24px; padding-top: 12px; border-top: 1px solid #ccc; font-size: 8pt; color: #888; text-align: center; }
</style>
</head>
<body>
<div class="aviso">
  <strong>⚠️ AVISO IMPORTANTE — ESTA É UMA ESTIMATIVA</strong><br>
  Este relatório foi gerado automaticamente cruzando as escalas com os relatórios Unitrac dos dias <strong>19, 20 e 25 de maio de 2026</strong>.
  Não é uma certeza absoluta — pode haver falsos positivos (loja marcada como CERTA mas que na verdade tem problema)
  ou falsos negativos (loja marcada como BUGADA que na verdade está OK). A análise depende de:
  <br>• A placa escalada ter sido efetivamente rastreada nos dias analisados<br>
  • O Unitrac ter reportado código de loja específico nas paradas<br>
  • Ausência de geofences sobrepostos com a BASE Benassi ou outras lojas<br>
  Use este documento como guia de prioridades para verificação manual e correção junto à Unitrac.
</div>
${htmlBody}
<div class="rodape">
  Análise estimada baseada em PDFs Unitrac dias 19/20/25 de maio 2026 — Triforce Auto / KPI Transmonseg
</div>
</body>
</html>`

writeFileSync(HTML_PATH, html)
console.log(`HTML gerado: ${HTML_PATH}`)

// Chrome headless → PDF
if (!existsSync(CHROME)) {
  console.error('Chrome não encontrado em:', CHROME)
  process.exit(1)
}

const cwd = process.cwd().replace(/\\/g, '/')
const htmlAbs = `${cwd}/${HTML_PATH}`.replace(/\//g, '/')
const pdfAbs = `${cwd}/${PDF_PATH}`.replace(/\//g, '/')

try {
  execSync(`"${CHROME}" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="${pdfAbs}" "file:///${htmlAbs}"`, { stdio: 'inherit' })
  console.log(`PDF gerado: ${PDF_PATH}`)
} catch (e: any) {
  console.error('Erro Chrome:', e.message)
  process.exit(1)
}
