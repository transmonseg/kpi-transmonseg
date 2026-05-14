import { normalizaPlaca } from '@/lib/utils/placa'
import type { AlteracaoParsed, SegmentoAlteracao } from '@/lib/types/alteracao'

const PLATE_RE = /\b([A-Z]{2,4}[-\s]?[0-9][A-Z0-9][0-9]{2}|[A-Z]{2,4}[-\s]?[0-9]{4})\b/gi
const COD_RE = /(?<!\d)(\d{2,6})(?!\d)/g

const ENTRA_KW = /\b(entr[ao]u?|substitui[çc][aã]o|novo|assumiu|assumindo|ficou|fica)\b/i
const SAI_KW = /\b(sai[uo]?|saindo|substitu[ií]do|substitui[çc][aã]o|retirou|removido|folga|falta|passou mal|quebrou|acidente)\b/i

const REDES = [
  'prezunic', 'princesa', 'zona sul', 'assaí', 'assai', 'açaí', 'acai',
  'carrefour', 'guanabara', 'superpax', 'pax', 'sendas', 'americanas',
  'feira nova', 'rede emanuel', 'vianense', 'mundial', 'supermarket',
]
const REDE_RE = new RegExp(
  `\\b(${REDES.map((r) => r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'gi'
)
const FILIAL_RE = /filial\s+(\d+)/i
const MOTIVO_RE = /(?:motivo|obs\.?|observa[çc][aã]o)\s*[:\-]?\s*(.+)/i

function normaliza(texto: string): string {
  let t = texto.replace(/[^\x00-\x7FÀ-ÿ\n]/g, ' ')
  t = t.replace(/\r\n|\r/g, '\n')
  t = t.replace(/[ \t]+/g, ' ')
  return t.trim()
}

function extraiPlaca(trecho: string): string | null {
  const re = new RegExp(PLATE_RE.source, 'gi')
  const m = re.exec(trecho)
  if (!m) return null
  return m[0].toUpperCase().replace(/[\s-]/g, '')
}

function extraiCod(trecho: string): string | null {
  const placa = extraiPlaca(trecho)
  let texto = trecho
  if (placa) texto = texto.replace(new RegExp(placa, 'gi'), '')
  const re = new RegExp(COD_RE.source, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(texto)) !== null) {
    if (m[1].length >= 3) return m[1]
  }
  return null
}

function extraiNome(trecho: string, placa: string | null, cod: string | null): string | null {
  let t = trecho
  if (placa) t = t.replace(new RegExp(placa, 'gi'), '')
  if (cod) t = t.replace(new RegExp(`\\b${cod}\\b`, 'g'), '')
  t = t.replace(/[:/\-]/g, ' ')
  t = t.replace(/\s+/g, ' ').trim()
  return t.length > 1 ? t : null
}

function parseSegmento(segmento: string): SegmentoAlteracao | null {
  const placa = extraiPlaca(segmento)
  const cod = extraiCod(segmento)
  const nome = extraiNome(segmento, placa, cod)
  if (!placa && !nome) return null
  return { nome, cod, placa }
}

export function normalizaPlacaAlteracao(s: string): string {
  return normalizaPlaca(s)
}

export function parseAlteracao(texto: string): AlteracaoParsed {
  const raw = normaliza(texto)
  const result: AlteracaoParsed = {
    tipo: 'BAIXA',
    redeRaw: null,
    lojaRaw: null,
    filial: null,
    entra: null,
    sai: null,
    motivo: null,
    confianca: 'baixa',
    raw,
  }

  const linhas = raw.split('\n').map((l) => l.trim()).filter(Boolean)

  const mRede = REDE_RE.exec(raw)
  REDE_RE.lastIndex = 0
  if (mRede) result.redeRaw = mRede[0].charAt(0).toUpperCase() + mRede[0].slice(1).toLowerCase()

  const mFilial = FILIAL_RE.exec(raw)
  if (mFilial) {
    result.filial = parseInt(mFilial[1], 10)
    result.redeRaw = result.redeRaw ?? 'Zona Sul'
  }

  for (const l of linhas) {
    const redeMatch = REDE_RE.exec(l)
    REDE_RE.lastIndex = 0
    if (redeMatch && !ENTRA_KW.test(l) && !SAI_KW.test(l)) {
      result.lojaRaw = l
      break
    }
  }

  const mMot = MOTIVO_RE.exec(raw)
  if (mMot) result.motivo = mMot[1].trim()

  // Strategy 1: explicit entra:/sai: labels
  for (const linha of linhas) {
    const l = linha.trim()
    if (/^entr[ao]u?\s*:/i.test(l)) {
      const seg = l.split(/^entr[ao]u?\s*:/i)[1]?.trim() ?? ''
      result.entra = parseSegmento(seg)
    } else if (/^sai[uo]?\s*:/i.test(l)) {
      const seg = l.split(/^sai[uo]?\s*:/i)[1]?.trim() ?? ''
      result.sai = parseSegmento(seg)
    }
  }

  // Strategy 2: single line with / or ; separator
  if (!result.entra && !result.sai) {
    for (const linha of linhas) {
      const partes = linha.split(/[/;]/)
      if (partes.length === 2) {
        const [a, b] = partes
        if (ENTRA_KW.test(a) || SAI_KW.test(b)) {
          result.entra = parseSegmento(b.trim())
          result.sai = parseSegmento(a.trim())
        } else if (new RegExp(PLATE_RE.source, 'gi').test(a) && new RegExp(PLATE_RE.source, 'gi').test(b)) {
          result.sai = parseSegmento(a.trim())
          result.entra = parseSegmento(b.trim())
        }
      }
    }
  }

  // Strategy 3: loose plates with context
  if (!result.entra && !result.sai) {
    const todasPlacas = [...raw.matchAll(new RegExp(PLATE_RE.source, 'gi'))]
    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i]
      if (!new RegExp(PLATE_RE.source, 'gi').test(linha)) continue
      const ctxAnt = i > 0 ? linhas[i - 1] : ''
      if (ENTRA_KW.test(ctxAnt) || ENTRA_KW.test(linha)) {
        result.entra = parseSegmento(linha)
      } else if (SAI_KW.test(ctxAnt) || SAI_KW.test(linha)) {
        result.sai = parseSegmento(linha)
      } else if (todasPlacas.length >= 2) {
        if (!result.sai) {
          result.sai = parseSegmento(linha)
        } else if (!result.entra) {
          result.entra = parseSegmento(linha)
        }
      }
    }
  }

  // Type detection
  if (/comunicado/i.test(raw)) {
    result.tipo = 'COMUNICADO'
  } else if (/segunda viagem|carro j[aá] escalado/i.test(raw)) {
    result.tipo = 'INFORMATIVO'
  } else if (result.entra && result.sai) {
    result.tipo = 'SUBSTITUICAO'
  } else if (result.entra) {
    result.tipo = 'INCLUSAO'
  } else {
    result.tipo = 'BAIXA'
  }

  // Confidence
  const campos = [
    Boolean(result.redeRaw),
    Boolean(result.entra?.placa),
    Boolean(result.sai?.placa),
  ].filter(Boolean).length
  result.confianca = campos === 3 ? 'alta' : campos >= 2 ? 'media' : 'baixa'

  return result
}
