import ExcelJS from 'exceljs'

export type StatusManual = 'entregue' | 'em_rota' | 'nao_foi' | 'mudou_de_rota' | 'desatualizado' | 'sem_rastreador' | 'indefinido'

/** Classifica a legenda do XLSX em status rico. Ordem por especificidade. NUNCA
 *  devolve "descartar": sem legenda + sem chegada = 'indefinido' (visível na tela). */
export function classificarStatusManual(txt: string, temChegada: boolean): StatusManual {
  const t = txt.toUpperCase()
  if (/DESATUALIZ/.test(t)) return 'desatualizado'
  if (/SEM\s*RASTREAD/.test(t)) return 'sem_rastreador'
  if (/MUDOU\s*DE\s*ROTA/.test(t)) return 'mudou_de_rota'
  if (/EM\s*ROTA|AGUARDANDO\s*BASE/.test(t)) return 'em_rota'
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
  if (v instanceof Date) return `${String(v.getUTCHours()).padStart(2, '0')}:${String(v.getUTCMinutes()).padStart(2, '0')}`
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
  let hr = -1
  for (let r = 1; r <= Math.min(ws.rowCount, 10); r++) {
    if (/REDES|FILIAIS/i.test(cell(ws.getRow(r).getCell(1).value))) { hr = r; break }
  }
  if (hr === -1) hr = 3
  const col = acharColunas(ws, hr)

  const out: EntradaManual[] = []
  for (let r = hr + 1; r <= ws.rowCount; r++) {
    const loja = cell(ws.getRow(r).getCell(1).value)
    if (!loja || loja.length < 2 || /^REDES|TOTAL/i.test(loja)) continue
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

/** Nome de aba que representa um dia do mês (1..31). Ignora "matriz", "base", etc. */
export function ehAbaDia(nome: string): number | null {
  const t = nome.trim()
  if (!/^\d{1,2}$/.test(t)) return null
  const dia = Number(t)
  return dia >= 1 && dia <= 31 ? dia : null
}

/**
 * Lê um XLSX de KPI manual da Tia (aba do dia, ex "19") e extrai uma entrada por
 * loja do 1º carro. Usado pelo dashboard que consome os KPIs manuais inseridos.
 */
export async function parseKpiManual(buf: Buffer, rede_id: string, data: string): Promise<EntradaManual[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf as unknown as ArrayBuffer)
  const ws = wb.getWorksheet(data.slice(8, 10)) ?? wb.worksheets[0]
  if (!ws) return []
  return parseWorksheet(ws, rede_id, data)
}

/**
 * Lê um XLSX de KPI manual com VÁRIAS abas-dia (uma por dia do mês) e extrai TODAS
 * de uma vez. `mes` é 'YYYY-MM'; cada aba cujo nome é um dia (1..31) vira a data
 * `${mes}-${dia}`. Abas auxiliares (matriz, base, endereços) são ignoradas.
 * Retorna o conjunto completo + a lista de dias detectados.
 */
export async function parseKpiManualTodasAbas(
  buf: Buffer,
  rede_id: string,
  mes: string,
): Promise<{ entradas: EntradaManual[]; dias: string[] }> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf as unknown as ArrayBuffer)
  const entradas: EntradaManual[] = []
  const dias: string[] = []
  for (const ws of wb.worksheets) {
    const dia = ehAbaDia(ws.name)
    if (dia == null) continue
    const data = `${mes}-${String(dia).padStart(2, '0')}`
    const ents = parseWorksheet(ws, rede_id, data)
    if (ents.length > 0) { entradas.push(...ents); dias.push(data) }
  }
  dias.sort()
  return { entradas, dias }
}
