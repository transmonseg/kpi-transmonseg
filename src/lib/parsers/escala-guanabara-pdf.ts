// Parser do PDF da Escala Guanabara (formato HLOG).
//
// Layout:
//   Header: "(HLOG) ESCALA GUANABARA DD/MM/YYYY (DIA-SEMANA)"
//   Linha cabeçalho: rota | qtd_carros | 1° CARRO | CÓDIGO | PLACA | CARRO | 2° CARRO | ...
//   Linhas de dados: até 31 rotas (com gaps possíveis em 21, 22, 24).
//     rota qtd_carros 1º_motorista cod placa tipo [2º_motorista cod placa tipo]
//   Tipos: TRUCK | TOCO
//   Motoristas podem ter "/" (dobradinha) e nomes com parênteses (ex: JOSE NILDON (DOCA)).
//   Placas mix antiga (KSG 5412, KSG-5412) e Mercosul (LGX-1J41).
//   Linha final: "TOTAL N"
//
// Janela de entrega 09-15h → turno MANHA. rede_id = GUANABARA.

import type { LinhaEscala } from '@/lib/types/escala'
import { normalizaPlaca } from '@/lib/utils/placa'

const GUANABARA_FILIAIS: Record<number, string> = {
  1: 'GB ENG DE DENTRO FILIAL 1',
  2: 'GB PENHA FILIAL 2',
  3: 'GB PIEDADE FILIAL 3',
  4: 'GB REALENGO FILIAL 4',
  5: 'GB BANGU FILIAL 5',
  6: 'GB ITAGUAI FILIAL 6',
  7: 'GB BARRA FILIAL 7',
  8: 'GB NITEROI FILIAL 8',
  9: 'GB IRAJA FILIAL 9',
  10: 'GB VILA ISABEL FILIAL 10',
  11: 'GB CAMPO GRANDE FILIAL 11',
  12: 'GB SAO GONCALO FILIAL 12',
  13: 'GB RIO DA PRATA FILIAL 13',
  14: 'GB PADRE MIGUEL FILIAL 14',
  15: 'GB BENTO RIBEIRO FILIAL 15',
  16: 'GB NOVA IGUACU FILIAL 16',
  17: 'GB CAMPINHO FILIAL 17',
  18: 'GB CAXIAS FILIAL 18',
  19: 'GB TANQUE FILIAL 19',
  20: 'GB PACIENCIA FILIAL 20',
  23: 'GB DEL CASTILHO FILIAL 23',
  25: 'GB TIJUCA FILIAL 25',
  26: 'GB CAMPO GRANDE FILIAL 26',
  27: 'GB RECREIO FILIAL 27',
  28: 'GB SANTA CRUZ FILIAL 28',
  29: 'GB SAO JOAO FILIAL 29',
  30: 'GB BONSUCESSO FILIAL 30',
  31: 'GB CATONHO FILIAL 31',
}

// pdf-parse v1.1.1 — default export é função (buf) => Promise<{text}>.
// v1 funciona em Node serverless sem depender de @napi-rs/canvas.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>

// Regex pra placa (aceita formato antigo ABC1234 / ABC-1234 / ABC 1234 e Mercosul ABC1D23 / ABC-1D23 / ABC 1D23)
// Lookbehind (?<![A-Z]) impede que 3 letras NO MEIO de um nome sejam tratadas
// como início de placa (ex: "ARTHUR" → "HUR" + "1841" virava placa falsa).
const PLACA_RE = /(?<![A-Z])\b([A-Z]{3}[\s-]?\d[A-Z0-9]\d{2}|[A-Z]{3}[\s-]?\d{4})\b/

// Tipos de carro aceitos
const TIPO_RE = /^(TRUCK|TOCO|VUC|3\/4|KIA|CARRETA|TOCO\s+REFRIGERADO)$/i

function parseHeaderDate(line: string): string | null {
  // "(HLOG) ESCALA GUANABARA DD/MM/YYYY (...)" — tabs between tokens
  const m = line.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

type CarroTokens = {
  motorista: string
  codigo: string | null
  placa: string
  tipo: string | null
}

// Recebe um array de tokens correspondentes a UM carro: [motorista, codigo, placa, tipo]
function tokensToCarro(tokens: string[]): CarroTokens | null {
  if (tokens.length < 3) return null
  // tokens[0..N-3] = motorista (pode ter espaços, mas split-por-tab já agregou)
  // Mas como PDF retorna 1 token por célula, esperamos 4 tokens: motor, cod, placa, tipo
  // Toleramos 3 tokens (faltando tipo) e 5+ (placa quebrada em duas células)

  // Tipo: último token se for TRUCK/TOCO/etc.
  let tipo: string | null = null
  let rest = [...tokens]
  if (rest.length >= 1 && TIPO_RE.test(rest[rest.length - 1])) {
    tipo = rest[rest.length - 1].toUpperCase()
    rest = rest.slice(0, -1)
  }

  // Placa: procura o último token (ou últimos 2 juntos) que matchea PLACA_RE
  let placa: string | null = null
  let placaIdx = -1

  if (rest.length >= 1) {
    const last = rest[rest.length - 1]
    if (PLACA_RE.test(last)) {
      placa = last
      placaIdx = rest.length - 1
    } else if (rest.length >= 2) {
      const joined = `${rest[rest.length - 2]} ${rest[rest.length - 1]}`
      if (PLACA_RE.test(joined)) {
        placa = joined
        placaIdx = rest.length - 2
      }
    }
  }

  if (placa === null) return null

  rest = rest.slice(0, placaIdx)

  // Código: último token, deve ser numérico
  let codigo: string | null = null
  if (rest.length >= 1 && /^\d{1,7}$/.test(rest[rest.length - 1])) {
    codigo = rest[rest.length - 1]
    rest = rest.slice(0, -1)
  }

  // Motorista: tudo o que sobrou
  const motorista = rest.join(' ').trim()
  if (!motorista) return null

  return { motorista, codigo, placa, tipo }
}

type Row = {
  rota: number
  qtd: number
  carro1: CarroTokens | null
  carro2: CarroTokens | null
}

// Pattern interno pra placa (ABC1234, ABC-1234, ABC 1234, ABC1D23, ABC-1D23, ABC 1D23)
// Lookbehind aplicado nas regex compostas abaixo (PLACA_TIPO_RE, PLACA_SO_RE)
// para evitar matches dentro de nomes (ex: "HUR" em "ARTHUR").
const PLACA_INLINE_RE = String.raw`[A-Z]{3}[\s-]?\d[A-Z0-9]\d{2}|[A-Z]{3}[\s-]?\d{4}`
// Pattern interno pra tipo — inclui TRCK (typo conhecido) e TRUCKR
const TIPO_INLINE_RE = String.raw`TRUCKR|TRUCK|TRCK|TOCO\s*REFRIGERADO|TOCO|VUC|3\/4|KIA|CARRETA`
// Combinado pra placa+tipo — sem \b no final: "TRUCKJOSE" é válido (tipo no meio da linha).
// \s? aceita espaço opcional entre placa e tipo.
// (?<![A-Z]) impede match dentro de nomes (ex: "HUR1841TRUCK" dentro de "ARTHUR1841...").
const PLACA_TIPO_RE = new RegExp(`(?<![A-Z])(${PLACA_INLINE_RE})\\s?(${TIPO_INLINE_RE})`, 'g')
// Fallback: placa sem TIPO no final (rota 11 Arthur, rota 30 Daniel — PDF
// omitiu o tipo). Match até fim da linha ou próxima sequência grande de números.
// (?<![A-Z]) crítico aqui: rota 11 "111ARTHUR184129KNI-8942" caía nesse caminho
// e capturava "HUR1841" dentro de "ARTHUR184129" como falsa placa.
const PLACA_SO_RE = new RegExp(`(?<![A-Z])(${PLACA_INLINE_RE})(?=\\s*$|\\s*\\d)`, 'g')

function parseRow(line: string): Row | null {
  const cleaned = line.replace(/\s*,\s*/g, ' ').replace(/\s+/g, ' ').trim()
  if (!cleaned) return null

  // Caminho 1: formato antigo com tabs entre tokens
  const tabTokens = cleaned.split(/\t+/).map((t) => t.trim()).filter((t) => t.length > 0)
  if (tabTokens.length >= 5) return parseRowFromTokens(tabTokens)

  // Caminho 2: formato grudado (pdf-parse v1)
  // Ex: "12RONALDO35KSG 5412TRUCKJOSE NILDON (DOCA) 753KVG 7A00TRUCK"
  //      rota=1, qtd=2, motor1=RONALDO, cod1=35, placa1=KSG 5412, tipo1=TRUCK, ...
  const startMatch = cleaned.match(/^(\d{1,2})([12])(?=[A-ZÀ-Ý])/)
  if (!startMatch) return null
  const rota = parseInt(startMatch[1], 10)
  const qtd = parseInt(startMatch[2], 10)
  if (rota < 1 || rota > 99) return null

  const rest = cleaned.slice(startMatch[0].length)
  const carros: CarroTokens[] = []
  let cursor = 0
  let m: RegExpExecArray | null
  PLACA_TIPO_RE.lastIndex = 0

  while ((m = PLACA_TIPO_RE.exec(rest)) !== null) {
    const before = rest.slice(cursor, m.index)
    const placa = m[1].trim()
    const tipo = m[2].toUpperCase().replace(/\s+/g, ' ')

    // before = motorista + codigo (1-7 dígitos no final)
    let motorista = before.trim()
    let codigo: string | null = null
    const codMatch = before.match(/^([\s\S]+?)(\d{1,7})$/)
    if (codMatch) {
      motorista = codMatch[1].trim()
      codigo = codMatch[2]
    }

    if (motorista) carros.push({ motorista, codigo, placa, tipo })
    cursor = m.index + m[0].length
  }

  // Fallback: se PLACA_TIPO_RE não pegou nada, tenta placa sozinha (sem tipo).
  // Cobre PDFs onde o tipo foi omitido (rota 11, 30 do dia 19/05).
  if (carros.length === 0) {
    PLACA_SO_RE.lastIndex = 0
    let m2: RegExpExecArray | null
    let cursor2 = 0
    while ((m2 = PLACA_SO_RE.exec(rest)) !== null) {
      const before = rest.slice(cursor2, m2.index)
      const placa = m2[1].trim()
      let motorista = before.trim()
      let codigo: string | null = null
      const codMatch = before.match(/^([\s\S]+?)(\d{1,7})$/)
      if (codMatch) {
        motorista = codMatch[1].trim()
        codigo = codMatch[2]
      }
      if (motorista) carros.push({ motorista, codigo, placa, tipo: null })
      cursor2 = m2.index + m2[0].length
    }
  }

  // Fallback: placa incompleta — apenas 3 letras seguidas de tipo de veículo.
  // Ex: "VAGNER 294 FSE TRUCK" — placa corrompida no PDF sem a parte numérica.
  // Preserva motorista e tipo; marca placa como incompleta.
  if (carros.length === 0) {
    const PLACA_PARCIAL_RE = /\b([A-Z]{3})\s+(TRUCKR|TRUCK|TRCK|TOCO\s*REFRIGERADO|TOCO|VUC|3\/4|KIA|CARRETA|BAAU|BAÚ|FURG)\b/g
    PLACA_PARCIAL_RE.lastIndex = 0
    let m3: RegExpExecArray | null
    let cursor3 = 0
    while ((m3 = PLACA_PARCIAL_RE.exec(rest)) !== null) {
      const before = rest.slice(cursor3, m3.index)
      const placaLetras = m3[1].trim()
      const tipo = m3[2].toUpperCase().replace(/\s+/g, ' ')
      let motorista = before.trim()
      let codigo: string | null = null
      const codMatch = before.match(/^([\s\S]+?)(\d{1,7})$/)
      if (codMatch) {
        motorista = codMatch[1].trim()
        codigo = codMatch[2]
      }
      if (motorista) {
        carros.push({
          motorista,
          codigo,
          placa: `${placaLetras} (incompleta)`,
          tipo,
        })
      }
      cursor3 = m3.index + m3[0].length
    }
  }

  if (carros.length === 0) return null

  return { rota, qtd, carro1: carros[0] ?? null, carro2: carros[1] ?? null }
}

function parseRowFromTokens(tokens: string[]): Row | null {
  if (!/^\d{1,3}$/.test(tokens[0])) return null
  const rota = parseInt(tokens[0], 10)
  if (rota < 1 || rota > 99) return null
  if (!/^[12]$/.test(tokens[1])) return null
  const qtd = parseInt(tokens[1], 10)

  const restAll = tokens.slice(2)

  type PlacaHit = { idx: number; width: 1 | 2 }
  const placaHits: PlacaHit[] = []
  for (let i = 0; i < restAll.length; i++) {
    if (PLACA_RE.test(restAll[i])) {
      placaHits.push({ idx: i, width: 1 })
    } else if (i + 1 < restAll.length && PLACA_RE.test(`${restAll[i]} ${restAll[i + 1]}`)) {
      placaHits.push({ idx: i, width: 2 })
      i++
    }
  }
  if (placaHits.length === 0) return null

  let carro1Tokens: string[]
  let carro2Tokens: string[] | null = null

  if (qtd === 1 || placaHits.length === 1) {
    carro1Tokens = restAll
  } else {
    const hit1 = placaHits[0]
    let cutEnd = hit1.idx + hit1.width
    if (cutEnd < restAll.length && TIPO_RE.test(restAll[cutEnd])) cutEnd++
    carro1Tokens = restAll.slice(0, cutEnd)
    carro2Tokens = restAll.slice(cutEnd)
  }

  const carro1 = tokensToCarro(carro1Tokens)
  const carro2 = carro2Tokens ? tokensToCarro(carro2Tokens) : null

  return { rota, qtd, carro1, carro2 }
}

// Junta linhas de continuação (formato grudado pode quebrar uma linha em várias)
function joinContinuationLines(lines: string[]): string[] {
  const out: string[] = []
  let current = ''

  for (const raw of lines) {
    const t = raw.replace(/\s+/g, ' ').trim()
    if (!t) continue

    // Headers e total: descarrega current e ignora (ou guarda header pra detecção de data)
    if (/^\(HLOG\)|ESCALA\s+GUANABARA/i.test(t)) {
      if (current) { out.push(current); current = '' }
      out.push(t)
      continue
    }
    if (/QTD\s*\.\s*CARROS|1°\s*CARRO|^TOTAL|^--\s*\d+\s+of/i.test(t)) {
      if (current) { out.push(current); current = '' }
      continue
    }

    // Nova linha começa com rota+qtd+letra
    if (/^\d{1,2}[12][A-ZÀ-Ý]/.test(t)) {
      if (current) out.push(current)
      current = t
    } else if (/^\d{1,2}[12]$/.test(t)) {
      // Rota+qtd sozinho (motorista na próxima linha): começa novo row
      if (current) out.push(current)
      current = t
    } else if (/^\d{1,7}$/.test(t)) {
      // Número puro (código de motorista): anexa à linha atual
      if (current) current += t
      else current = t
    } else {
      // Continuação textual
      if (current) current += t
      else current = t
    }
  }
  if (current) out.push(current)
  return out
}

export async function parseEscalaGuanabaraPdf(
  buffer: ArrayBuffer | Buffer,
  dataAlvo?: string,
): Promise<LinhaEscala[]> {
  const buf = buffer instanceof ArrayBuffer ? Buffer.from(buffer) : buffer
  const result = await pdfParse(buf)
  const fullText = result.text ?? ''

  // pdf-parse v1 pode quebrar uma linha de rota em várias — junta continuações
  const lines = joinContinuationLines(fullText.split(/\r?\n/))

  // Detecta data
  let dataISO: string | null = null
  for (const line of lines) {
    if (/HLOG.*ESCALA\s+GUANABARA/i.test(line)) {
      dataISO = parseHeaderDate(line)
      break
    }
  }
  if (!dataISO) {
    // fallback: primeira data DD/MM/YYYY que aparecer
    for (const line of lines) {
      const m = line.match(/(\d{2})\/(\d{2})\/(\d{4})/)
      if (m) {
        dataISO = `${m[3]}-${m[2]}-${m[1]}`
        break
      }
    }
  }
  if (!dataISO) {
    throw new Error('[escala-guanabara-pdf] Data não encontrada no PDF.')
  }
  if (dataAlvo && dataAlvo !== dataISO) return []

  const linhas: LinhaEscala[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line || line.trim() === '') continue
    if (/HLOG|ESCALA\s+GUANABARA/i.test(line)) continue
    if (/QTD\s*\.\s*CARROS|1°\s*CARRO|PLACA|CÓDIGO|CODIGO/i.test(line)) continue
    if (/^TOTAL/i.test(line.trim())) continue
    if (/^--\s*\d+\s+of\s+\d+/i.test(line.trim())) continue

    const row = parseRow(line)
    if (!row) {
      // Chegou até aqui passando pelos filtros de cabeçalho/rodapé (linhas
      // 369-372) — ou seja, PARECIA linha de dado real mas não bateu o formato
      // esperado (ex: placa corrompida pelo OCR). Log em vez de sumir sem
      // rastro: sem isso, rota que falha aqui só aparece como "faltando
      // ~N linhas" numa auditoria manual, sem pista de qual nem por quê.
      console.warn(`[escala-guanabara-pdf] linha não reconhecida (descartada): "${line.trim()}"`)
      continue
    }
    if (!row.carro1) continue

    const lojaNome = GUANABARA_FILIAIS[row.rota] ?? `Guanabara - Rota ${String(row.rota).padStart(2, '0')}`
    const lojaCodigo = String(row.rota)

    const linha1: LinhaEscala = {
      data: dataISO,
      data_entrega: dataISO,
      rede_id: 'GUANABARA',
      loja_nome_raw: lojaNome,
      loja_codigo_raw: lojaCodigo,
      placa_norm: row.carro1.placa.includes('(incompleta)') ? '' : normalizaPlaca(row.carro1.placa),
      placa_raw: row.carro1.placa,
      motorista_nome: row.carro1.motorista,
      motorista_codigo: row.carro1.codigo,
      tipo_carro: row.carro1.tipo,
      carro_ordem: 1,
      turno: 'MANHA',
      tipo_emissao: 'NORMAL',
      obs: null,
      restricao: null,
      peso_kg: null,
      paletes: null,
      raw_row_num: i + 1,
    }
    linhas.push(linha1)

    if (row.carro2) {
      const linha2: LinhaEscala = {
        ...linha1,
        placa_norm: row.carro2.placa.includes('(incompleta)') ? '' : normalizaPlaca(row.carro2.placa),
        placa_raw: row.carro2.placa,
        motorista_nome: row.carro2.motorista,
        motorista_codigo: row.carro2.codigo,
        tipo_carro: row.carro2.tipo,
        carro_ordem: 2,
      }
      linhas.push(linha2)
    }
  }

  return linhas
}
