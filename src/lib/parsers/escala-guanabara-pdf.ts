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

// pdf-parse v2 — PDFParse class (carregado via require por compatibilidade)
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const { PDFParse } = require('pdf-parse') as any

// Regex pra placa (aceita formato antigo ABC1234 / ABC-1234 / ABC 1234 e Mercosul ABC1D23 / ABC-1D23 / ABC 1D23)
const PLACA_RE = /\b([A-Z]{3}[\s-]?\d[A-Z0-9]\d{2}|[A-Z]{3}[\s-]?\d{4})\b/

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

function parseRow(line: string): Row | null {
  // Linha vem com tabs (\t) como separadores
  // Ex: "1 \t 2 \t RONALDO \t 35 \t KSG 5412 \t TRUCK \t JOSE NILDON (DOCA) \t 753 \t KVG 7A00 \t TRUCK"
  // Tokens podem vir com vírgulas vazias (ex: ", " em "14") — limpar.
  const cleaned = line.replace(/\s*,\s*/g, ' ').trim()
  const tokens = cleaned.split(/\t+/).map((t) => t.trim()).filter((t) => t.length > 0)
  if (tokens.length < 5) return null

  // Primeiro token = rota (numero)
  if (!/^\d{1,3}$/.test(tokens[0])) return null
  const rota = parseInt(tokens[0], 10)
  if (rota < 1 || rota > 99) return null

  // Segundo token = qtd_carros (1 ou 2)
  if (!/^[12]$/.test(tokens[1])) return null
  const qtd = parseInt(tokens[1], 10)

  const restAll = tokens.slice(2)

  // Se qtd=1 → um carro só (3 ou 4 tokens em restAll)
  // Se qtd=2 → dois carros (6 a 8 tokens)
  // Mas é mais robusto procurar o "ponto de virada" entre carro1 e carro2 olhando pra placas.

  // Estratégia: encontrar todas as posições onde token bate como placa
  const placaIdxs: number[] = []
  for (let i = 0; i < restAll.length; i++) {
    if (PLACA_RE.test(restAll[i])) placaIdxs.push(i)
  }

  if (placaIdxs.length === 0) return null

  let carro1Tokens: string[]
  let carro2Tokens: string[] | null = null

  if (qtd === 1 || placaIdxs.length === 1) {
    carro1Tokens = restAll
  } else {
    // qtd=2 → dividir em dois carros usando a 1ª placa como divisor
    // Carro1 termina logo após a 1ª placa (+1 se houver tipo TRUCK/TOCO)
    const placaIdx1 = placaIdxs[0]
    let cutEnd = placaIdx1 + 1 // inclui placa
    if (cutEnd < restAll.length && TIPO_RE.test(restAll[cutEnd])) {
      cutEnd++ // inclui tipo
    }
    carro1Tokens = restAll.slice(0, cutEnd)
    carro2Tokens = restAll.slice(cutEnd)
  }

  const carro1 = tokensToCarro(carro1Tokens)
  const carro2 = carro2Tokens ? tokensToCarro(carro2Tokens) : null

  return { rota, qtd, carro1, carro2 }
}

export async function parseEscalaGuanabaraPdf(
  buffer: ArrayBuffer | Buffer,
  dataAlvo?: string,
): Promise<LinhaEscala[]> {
  const buf = buffer instanceof ArrayBuffer ? Buffer.from(buffer) : buffer
  const parser = new PDFParse({ data: buf })
  const result = await parser.getText()
  const fullText = (result.text as string) ?? ''

  const lines = fullText.split(/\r?\n/)

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
    if (!row) continue
    if (!row.carro1) continue

    const lojaNome = `Guanabara - Rota ${String(row.rota).padStart(2, '0')}`
    const lojaCodigo = String(row.rota)

    const linha1: LinhaEscala = {
      data: dataISO,
      data_entrega: dataISO,
      rede_id: 'GUANABARA',
      loja_nome_raw: lojaNome,
      loja_codigo_raw: lojaCodigo,
      placa_norm: normalizaPlaca(row.carro1.placa),
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
        placa_norm: normalizaPlaca(row.carro2.placa),
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
