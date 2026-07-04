import ExcelJS from 'exceljs'

// 4 status apenas — pedido do Joaquim 2026-07-01: a planilha real usa dezenas de
// legendas (MUDOU DE ROTA, DESATUALIZADO, EM ROTA, SEM INFORMAÇÃO DE ALTERAÇÃO...)
// e categorias como "em rota"/"em análise" ficavam presas pra sempre em dias já
// fechados (quem preenche marca e nunca volta pra completar). Consolida tudo em
// entregue / não foi / sem rastreador / indefinido (sem dado).
export type StatusManual = 'entregue' | 'nao_foi' | 'sem_rastreador' | 'indefinido'

/** Classifica a legenda do XLSX em status rico. Ordem por especificidade. NUNCA
 *  devolve "descartar": sem legenda + sem chegada = 'indefinido' (visível na tela).
 *  - "desatualizado" (rastreador sem transmitir) conta como sem_rastreador: na
 *    prática não há dado de GPS de qualquer forma.
 *  - "mudou de rota" conta como não_foi: o veículo confirmadamente não passou
 *    nesta loja.
 *  - "em rota"/"aguardando base" vira indefinido: não dá pra saber o desfecho. */
export function classificarStatusManual(txt: string, temChegada: boolean): StatusManual {
  const t = txt.toUpperCase()
  if (/DESATUALIZ/.test(t)) return 'sem_rastreador'
  if (/SEM\s*RASTREAD/.test(t)) return 'sem_rastreador'
  if (/MUDOU\s*DE\s*ROTA/.test(t)) return 'nao_foi'
  if (/EM\s*ROTA|AGUARDANDO\s*BASE/.test(t)) return 'indefinido'
  if (/N[ÃA]O\s*SAIU/.test(t)) return 'nao_foi'
  if (/N[ÃA]O\s*FOI/.test(t)) return 'nao_foi'
  if (temChegada) return 'entregue'
  return 'indefinido'
}

export interface EntradaManual {
  rede_id: string
  data: string
  loja: string
  placa: string | null
  motorista: string | null
  status: StatusManual
  saida_cd: string | null
  chd: string | null
  sai: string | null
  /** Volta pra base (coluna "CHEGADA CD"). Null quando o KPI não tem a coluna. */
  volta_base: string | null
}

function cell(v: unknown): string {
  if (v == null) return ''
  if (v instanceof Date) {
    // Data/hora inválida (célula corrompida ou fórmula não resolvida no Excel do
    // cliente): sem o guard, getUTCHours()/getUTCMinutes() retornam NaN e o
    // String(NaN) grava o texto literal "NaN:NaN" na célula — aconteceu na
    // coluna PLACA quando o Excel do cliente tinha uma célula de hora corrompida
    // ali (Zona Sul/Guanabara/Feira Nova, 01/07). Vazio > lixo visível na planilha.
    if (Number.isNaN(v.getTime())) return ''
    return `${String(v.getUTCHours()).padStart(2, '0')}:${String(v.getUTCMinutes()).padStart(2, '0')}`
  }
  if (typeof v === 'object') {
    const o = v as { text?: string; result?: unknown; richText?: Array<{ text: string }> }
    if (o.text) return o.text
    if (o.result != null) return cell(o.result)
    if (o.richText) return o.richText.map(r => r.text).join('')
    return ''
  }
  return String(v).trim()
}

const hhmm = (s: string): string | null => {
  const m = s.match(/(\d{1,2}):(\d{2})/)
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null
}

// UPPER sem acento — base de toda detecção semântica (header, coluna de loja).
const up = (s: string): string => s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// Palavras-chave de um cabeçalho de KPI manual. O header é a linha que casa o
// maior número delas (em QUALQUER coluna), não uma posição/texto fixo — assim
// tolera "CHEGADA LOJA" vs "CHD LOJA", header na linha 2 ou 3, coluna deslocada.
const HEADER_KW = [/REDES/, /FILIA/, /MOTORISTA/, /PLACA/, /SAIDA/, /CHEGAD/, /\bCHD\b/, /LOJA/, /CLIENTE/]

// Acha a linha de cabeçalho varrendo as primeiras linhas e pontuando por
// palavras-chave. Retorna -1 quando nenhuma linha parece um header (≥2 kw).
function acharHeaderRow(ws: ExcelJS.Worksheet): number {
  let best = -1, bestScore = 1 // exige ≥2 kw: começa em 1 pra que só score≥2 vença
  const limR = Math.min(ws.rowCount, 15)
  const limC = Math.min(ws.columnCount, 20)
  for (let r = 1; r <= limR; r++) {
    const row = ws.getRow(r)
    let txt = ''
    for (let c = 1; c <= limC; c++) txt += ' ' + up(cell(row.getCell(c).value))
    let score = 0
    for (const kw of HEADER_KW) if (kw.test(txt)) score++
    if (score > bestScore) { bestScore = score; best = r }
  }
  return best
}

// Acha a coluna do identificador da loja a partir do header. Prioriza o rótulo
// do cliente (REDES/FILIAIS/CLIENTE/UNIDADE); evita "SAIDA LOJA"/"CHEGADA LOJA"
// (que também contêm "LOJA"). Fallback: 1ª coluna textual do header.
function acharColunaLoja(ws: ExcelJS.Worksheet, hr: number): number {
  const row = ws.getRow(hr)
  const limC = Math.min(ws.columnCount, 20)
  for (let c = 1; c <= limC; c++) {
    const t = up(cell(row.getCell(c).value)).replace(/\s+/g, ' ').trim()
    if (/REDES|FILIA|CLIENTE|UNIDADE/.test(t)) return c
  }
  for (let c = 1; c <= limC; c++) {
    const t = up(cell(row.getCell(c).value)).replace(/\s+/g, ' ').trim()
    if (/^LOJAS?$/.test(t)) return c   // "LOJA" sozinho, não "SAIDA LOJA"
  }
  for (let c = 1; c <= limC; c++) {
    if (cell(row.getCell(c).value).trim().length >= 2) return c
  }
  return 1
}

// Localiza as colunas do 1º carro pelo HEADER. O layout varia por rede (ex: Zona
// Sul não tem coluna COD), então posição fixa não serve — detecta dinamicamente.
interface Cols { motorista: number; placa: number; saidaCd: number; chd: number; sai: number; voltaBase: number }
function acharColunas(ws: ExcelJS.Worksheet, hr: number): Cols {
  // voltaBase = -1 → coluna "CHEGADA CD" não existe nesse KPI (retrocompatível).
  const c: Cols = { motorista: 2, placa: 4, saidaCd: 5, chd: 6, sai: 7, voltaBase: -1 }
  let mot = -1, pl = -1, cd = -1, ch = -1, sa = -1, vb = -1
  const row = ws.getRow(hr)
  for (let i = 1; i <= ws.columnCount; i++) {
    const t = cell(row.getCell(i).value).toUpperCase().replace(/\s+/g, ' ')
    if (/^MOTORISTA/.test(t) && mot === -1) mot = i
    else if (/^PLACA/.test(t) && pl === -1) pl = i
    else if (/SAIDA\s*CD/.test(t) && cd === -1) cd = i
    else if (/(CH?D|CHEGAD)/.test(t) && /LOJA/.test(t) && ch === -1) ch = i
    else if (/SAIDA\s*LOJA/.test(t) && sa === -1) sa = i
    // "CHEGADA CD" = volta pra base (sem LOJA; difere de "CHD LOJA" e "SAIDA CD").
    else if (/CHEGAD/.test(t) && /CD/.test(t) && vb === -1) vb = i
  }
  if (mot !== -1) c.motorista = mot
  if (pl !== -1) c.placa = pl
  if (cd !== -1) c.saidaCd = cd
  if (ch !== -1) c.chd = ch
  if (sa !== -1) c.sai = sa
  if (vb !== -1) c.voltaBase = vb
  return c
}

/**
 * Extrai as entradas de UMA aba (do 1º carro): status, placa, motorista, horários.
 * `data` é a data já resolvida (YYYY-MM-DD) que carimba cada entrada.
 */
function parseWorksheet(ws: ExcelJS.Worksheet, rede_id: string, data: string): EntradaManual[] {
  // Header e coluna da loja por SEMÂNTICA (não posição fixa). Sem header
  // reconhecível, devolve [] — o diagnóstico explica o que faltou.
  const hr = acharHeaderRow(ws)
  if (hr === -1) return []
  const colLoja = acharColunaLoja(ws, hr)
  const col = acharColunas(ws, hr)

  const out: EntradaManual[] = []
  for (let r = hr + 1; r <= ws.rowCount; r++) {
    const loja = cell(ws.getRow(r).getCell(colLoja).value)
    if (!loja || loja.length < 2 || /^REDES|^FILIA|TOTAL/i.test(up(loja))) continue
    const placa = cell(ws.getRow(r).getCell(col.placa).value) || null
    const motorista = cell(ws.getRow(r).getCell(col.motorista).value) || null
    // junta o range placa..sai+1 pra capturar "SEM RASTREADOR" / "NÃO FOI AO CLIENTE"
    // que vazam entre células mescladas. Inclui a coluna da PLACA porque é comum o
    // marcador substituir a placa (sem GPS → "SEM RASTREADOR" no lugar da placa);
    // sem isso a linha tinha chd e virava 'entregue' indevidamente. Não passa de
    // sai+1 pra não vazar nos marcadores do 2º carro.
    const ini = Math.min(col.placa, col.saidaCd, col.chd, col.sai)
    const fim = Math.max(col.saidaCd, col.chd, col.sai) + 1
    let txt = ''
    for (let i = ini; i <= fim; i++) txt += ' ' + cell(ws.getRow(r).getCell(i).value).toUpperCase()
    const chd = hhmm(cell(ws.getRow(r).getCell(col.chd).value))
    const sai = hhmm(cell(ws.getRow(r).getCell(col.sai).value))
    const saida_cd = hhmm(cell(ws.getRow(r).getCell(col.saidaCd).value))
    const volta_base = col.voltaBase !== -1 ? hhmm(cell(ws.getRow(r).getCell(col.voltaBase).value)) : null
    // NUNCA descarta linha: legenda rica → categoria; sem legenda + sem chegada =
    // 'indefinido' (visível). Antes, o `else continue` sumia com em rota/desatualizado.
    const status = classificarStatusManual(txt, !!chd)
    out.push({ rede_id, data, loja, placa, motorista, status, saida_cd, chd, sai, volta_base })
  }
  return out
}

// Abas que NUNCA são um dia, mesmo contendo número (ex "BASE 2", "endereço
// filiais"). Checado antes de extrair dígitos pra não virar dia por engano.
const ABA_AUXILIAR_RE = /matriz|base|endere|total|resumo|consolidad|m[êe]s|sheet|planilha|p[áa]gina/i

/**
 * Nome de aba que representa um dia do mês (1..31), tolerante a como o operador
 * digita: "19", "01", "19/05", "19-05", "19.05", "DIA 19", "19 SEG", "SEG 19".
 * Ignora abas auxiliares (matriz, base, endereço, total, resumo…). Retorna o dia
 * ou null. Antes exigia o nome ser EXATAMENTE o número — qualquer variação
 * (data, prefixo "DIA", dia da semana junto) derrubava o reconhecimento do mês.
 */
export function ehAbaDia(nome: string): number | null {
  const t = nome.trim()
  if (!t || ABA_AUXILIAR_RE.test(t)) return null
  // 1) Puro número (caso canônico): "19", "01"
  if (/^\d{1,2}$/.test(t)) {
    const d = Number(t)
    return d >= 1 && d <= 31 ? d : null
  }
  // 2) Data com dia primeiro (formato BR): "19/05", "19-05", "19.05"
  const dm = t.match(/^(\d{1,2})\s*[/.\-]\s*\d{1,2}/)
  if (dm) {
    const d = Number(dm[1])
    if (d >= 1 && d <= 31) return d
  }
  // 3) Dia como token isolado: "DIA 19", "19 SEG", "SEG 19". \b\d{1,2}\b não casa
  //    dentro de "2026" (ano), então não confunde com data completa.
  for (const m of t.matchAll(/\b(\d{1,2})\b/g)) {
    const d = Number(m[1])
    if (d >= 1 && d <= 31) return d
  }
  return null
}

/**
 * Lê um XLSX de KPI manual da Tia (aba do dia, ex "19") e extrai uma entrada por
 * loja do 1º carro. Usado pelo dashboard que consome os KPIs manuais inseridos.
 */
export async function parseKpiManual(buf: Buffer, rede_id: string, data: string): Promise<EntradaManual[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf as unknown as ArrayBuffer)
  const diaAlvo = Number(data.slice(8, 10))
  // Acha a aba do dia por SEMÂNTICA (tolera "19/05", "DIA 19"); cai no nome exato
  // e, por fim, na 1ª aba só se nada casar (retrocompat com o que existia).
  const ws =
    wb.worksheets.find(w => ehAbaDia(w.name) === diaAlvo) ??
    wb.getWorksheet(data.slice(8, 10)) ??
    wb.worksheets[0]
  if (!ws) return []
  return parseWorksheet(ws, rede_id, data)
}

/** Diagnóstico da planilha — alimenta a mensagem de erro quando nada é extraído. */
export interface DiagPlanilha {
  abas: string[]          // todas as abas do arquivo
  abasDia: string[]       // abas reconhecidas como dia (1..31)
  abasComLojas: string[]  // abas-dia das quais extraiu ≥1 linha de loja
}

/** Monta a mensagem de erro explicando O QUE não foi reconhecido (em vez do
 *  genérico "nenhuma loja"). Usada pela rota de upload. */
export function mensagemDiagnostico(diag: DiagPlanilha): string {
  const abas = diag.abas.length ? diag.abas.map(a => `"${a}"`).join(', ') : '(nenhuma)'
  if (diag.abasDia.length === 0) {
    return `Nenhuma aba parece um dia do mês. Abas encontradas: ${abas}. `
      + `Renomeie a aba de cada dia para o número do dia (ex: "19", "01" ou "19/05").`
  }
  // Tem aba-dia, mas nenhuma rendeu linhas → cabeçalho/coluna de loja não achados.
  return `Abas de dia reconhecidas (${diag.abasDia.map(a => `"${a}"`).join(', ')}), `
    + `mas não encontrei o cabeçalho com a coluna de lojas. Confira se existe uma `
    + `linha de cabeçalho com "REDES / FILIAIS" (ou "LOJA"/"CLIENTE") e colunas `
    + `como MOTORISTA, PLACA, SAÍDA CD, CHEGADA LOJA, SAÍDA LOJA.`
}

/**
 * Lê um XLSX de KPI manual com VÁRIAS abas-dia (uma por dia do mês) e extrai TODAS
 * de uma vez. `mes` é 'YYYY-MM'; cada aba cujo nome representa um dia (1..31) vira
 * a data `${mes}-${dia}`. Abas auxiliares (matriz, base, endereços) são ignoradas.
 * Retorna o conjunto completo, os dias detectados e um diagnóstico do arquivo.
 */
export async function parseKpiManualTodasAbas(
  buf: Buffer,
  rede_id: string,
  mes: string,
): Promise<{ entradas: EntradaManual[]; dias: string[]; diag: DiagPlanilha }> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf as unknown as ArrayBuffer)
  const entradas: EntradaManual[] = []
  const dias: string[] = []
  const diag: DiagPlanilha = { abas: wb.worksheets.map(w => w.name), abasDia: [], abasComLojas: [] }
  for (const ws of wb.worksheets) {
    const dia = ehAbaDia(ws.name)
    if (dia == null) continue
    diag.abasDia.push(ws.name)
    const data = `${mes}-${String(dia).padStart(2, '0')}`
    const ents = parseWorksheet(ws, rede_id, data)
    if (ents.length > 0) { entradas.push(...ents); dias.push(data); diag.abasComLojas.push(ws.name) }
  }
  dias.sort()
  return { entradas, dias, diag }
}
