import { normalizaPlaca } from '@/lib/utils/placa'

export interface VeiculoSlot {
  motorista_nome: string | null
  motorista_codigo: number | null
  placa_raw: string | null
  placa_norm: string | null
}

export interface AlteracaoParsed {
  tipo: 'SUBSTITUICAO' | 'INCLUSAO' | 'COMUNICADO' | 'INFORMATIVO' | 'SWAP'
  rede_id: string | null
  loja_nome_raw: string | null
  entra: VeiculoSlot | null
  sai: VeiculoSlot | null
  motivo: string | null
  texto_original: string
  confianca: 'alta' | 'media' | 'baixa'
}

const REDE_MAP: Array<{ pat: string; id: string }> = [
  { pat: 'prezunic', id: 'PREZUNIC' },
  { pat: 'princesa', id: 'PRINCESA' },
  { pat: 'carrefour', id: 'CARREFOUR' },
  { pat: 'assa', id: 'ASSAI' },
  { pat: 'atacad', id: 'ATACADAO' },
  { pat: 'super prix', id: 'SUPERPRIX' },
  { pat: 'superprix', id: 'SUPERPRIX' },
  { pat: "sam's", id: 'SAMS_CLUB' },
  { pat: 'sams club', id: 'SAMS_CLUB' },
  { pat: 'vianen', id: 'VIANENSE' },
  { pat: 'sendas', id: 'SENDAS' },
  { pat: 'guanabara', id: 'GUANABARA' },
  { pat: 'super pax', id: 'SUPER_PAX' },
  { pat: 'superpax', id: 'SUPER_PAX' },
  { pat: 'feira nova', id: 'FEIRA_NOVA' },
  { pat: 'emanuel', id: 'EMANUEL' },
  { pat: 'armaz', id: 'ARMAZEM_GRAO' },
  { pat: 'zona sul', id: 'ZONA_SUL' },
  { pat: 'mega box', id: 'ZONA_SUL' },
  { pat: 'mundial', id: 'MUNDIAL' },
  { pat: 'cab petropolis', id: 'CAB_PETROPOLIS' },
  { pat: 'cab_petropolis', id: 'CAB_PETROPOLIS' },
]

const PLACA_RE = /\b([A-Z]{3}[\s-]?\d[A-Z0-9]\d{2}|[A-Z]{3}[\s-]?\d{4})\b/i
const ENTRA_LABEL_RE = /^\s*entra\s*:?\s*[:\-]?\s*/i
const SAI_LABEL_RE = /^\s*sai\s*:?\s*[:\-]?\s*/i
const ENTRA_LINE_RE = /^\s*entra\s*:/i
const SAI_LINE_RE = /^\s*sai\s*:/i
const PLACA_SAI_RE = /^\s*placa\s+sai\s*:/i
const PLACA_ENTRA_RE = /^\s*placa\s+entra\s*:/i
const MOTIVO_RE = /^\s*(?:motivo|obs)\s*\.?\s*:?\s*(.+?)\s*$/i
const FILIAL_NUM_RE = /\bfilial\s+(\d+)/i
const DASH_ONLY_RE = /^[-—–\s]+$/

function normalizaTexto(s: string): string {
  return s
    .replace(/\r\n|\r/g, '\n')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ' ')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .trim()
}

function extraiPlaca(trecho: string): { raw: string; norm: string } | null {
  const m = trecho.match(PLACA_RE)
  if (!m) return null
  const raw = m[1].toUpperCase()
  const norm = normalizaPlaca(raw)
  return { raw, norm }
}

function extraiCodigo(trecho: string, placaRaw: string | null): number | null {
  let t = trecho
  if (placaRaw) {
    const re = new RegExp(placaRaw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    t = t.replace(re, ' ')
  }
  const matches = t.match(/\b\d{2,6}\b/g)
  if (!matches || matches.length === 0) return null
  const n = parseInt(matches[0], 10)
  return isNaN(n) ? null : n
}

function extraiNome(trecho: string, placaRaw: string | null, codigo: number | null): string | null {
  let t = trecho
  if (placaRaw) {
    const re = new RegExp(placaRaw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    t = t.replace(re, ' ')
  }
  if (codigo !== null) {
    t = t.replace(new RegExp(`\\b${codigo}\\b`, 'g'), ' ')
  }
  t = t.replace(/[,;:/]/g, ' ').replace(/\s+/g, ' ').trim()
  if (DASH_ONLY_RE.test(t)) return null
  return t.length > 1 ? t : null
}

function parseSlot(segmento: string): VeiculoSlot | null {
  const trim = segmento.trim()
  if (!trim || DASH_ONLY_RE.test(trim)) return null
  const placa = extraiPlaca(trim)
  const placaRaw = placa?.raw ?? null
  const placaNorm = placa?.norm ?? null
  const codigo = extraiCodigo(trim, placaRaw)
  const nome = extraiNome(trim, placaRaw, codigo)
  if (!placaNorm && !nome && codigo === null) return null
  return { motorista_nome: nome, motorista_codigo: codigo, placa_raw: placaRaw, placa_norm: placaNorm }
}

function detectaRede(texto: string, filialFound: boolean): string | null {
  const lower = texto.toLowerCase()
  for (const { pat, id } of REDE_MAP) {
    if (lower.includes(pat)) return id
  }
  if (filialFound) return 'ZONA_SUL'
  return null
}

function detectaLoja(linhas: string[], redeId: string | null): string | null {
  for (const linha of linhas) {
    if (!linha) continue
    if (ENTRA_LINE_RE.test(linha)) continue
    if (SAI_LINE_RE.test(linha)) continue
    if (PLACA_SAI_RE.test(linha)) continue
    if (PLACA_ENTRA_RE.test(linha)) continue
    if (MOTIVO_RE.test(linha)) continue
    if (/altera[çc][aã]o|comunicado/i.test(linha)) continue
    // Skip structured "Rede: X" lines
    if (/^\s*rede\s*:/i.test(linha)) continue
    // Handle structured "Loja: X" → return just X
    const lojaMatch = /^\s*loja\s*:\s*(.+)$/i.exec(linha)
    if (lojaMatch) return lojaMatch[1].trim()
    // Filial N line is a valid loja identifier
    if (FILIAL_NUM_RE.test(linha) && !/sai|entra/i.test(linha)) return linha
    const lower = linha.toLowerCase()
    if (redeId) {
      for (const { pat, id } of REDE_MAP) {
        if (id === redeId && lower.includes(pat)) return linha
      }
    } else {
      for (const { pat } of REDE_MAP) {
        if (lower.includes(pat)) return linha
      }
    }
  }
  return null
}

export function parseAlteracaoText(texto: string): AlteracaoParsed {
  const original = texto
  const norm = normalizaTexto(texto)
  const linhas = norm.split('\n').map((l) => l.trim()).filter(Boolean)

  const filialFound = FILIAL_NUM_RE.test(norm)
  const redeId = detectaRede(norm, filialFound)
  const lojaRaw = detectaLoja(linhas, redeId)

  let entra: VeiculoSlot | null = null
  let sai: VeiculoSlot | null = null
  let motivo: string | null = null

  for (const linha of linhas) {
    if (ENTRA_LINE_RE.test(linha)) {
      const seg = linha.replace(ENTRA_LABEL_RE, '')
      const slot = parseSlot(seg)
      // Only overwrite if we get a better slot (has placa or name)
      if (!entra || slot?.placa_norm) entra = slot
      continue
    }
    if (SAI_LINE_RE.test(linha)) {
      const seg = linha.replace(SAI_LABEL_RE, '')
      const slot = parseSlot(seg)
      if (!sai || slot?.placa_norm) sai = slot
      continue
    }
    // Structured "Placa sai: X" — add/override placa on sai slot
    if (PLACA_SAI_RE.test(linha)) {
      const seg = linha.replace(PLACA_SAI_RE, '').trim()
      const placa = extraiPlaca(seg)
      if (placa) {
        sai = sai
          ? { ...sai, placa_raw: placa.raw, placa_norm: placa.norm }
          : { motorista_nome: null, motorista_codigo: null, placa_raw: placa.raw, placa_norm: placa.norm }
      }
      continue
    }
    // Structured "Placa entra: X" — add/override placa on entra slot
    if (PLACA_ENTRA_RE.test(linha)) {
      const seg = linha.replace(PLACA_ENTRA_RE, '').trim()
      const placa = extraiPlaca(seg)
      if (placa) {
        entra = entra
          ? { ...entra, placa_raw: placa.raw, placa_norm: placa.norm }
          : { motorista_nome: null, motorista_codigo: null, placa_raw: placa.raw, placa_norm: placa.norm }
      }
      continue
    }
    const mMot = linha.match(MOTIVO_RE)
    if (mMot) {
      motivo = mMot[1].replace(/^[.:\-\s]+/, '').trim()
      continue
    }
  }

  // Extração implícita: se nenhum slot foi preenchido por labels, varre as linhas em
  // busca de placas "soltas" (formato WhatsApp/bullet/curto sem "entra:" explícito).
  // Trata cada placa como ENTRA (sem contexto não dá pra saber se é entra ou sai).
  if (!entra && !sai) {
    for (const linha of linhas) {
      if (/altera[çc][aã]o/i.test(linha)) continue // pula cabeçalhos
      const slot = parseSlot(linha)
      if (slot?.placa_norm) {
        entra = slot
        break
      }
    }
  }

  // Tipo detection
  let tipo: AlteracaoParsed['tipo']
  const isTrocaCarro = /troca\s+de\s+carro|motorista\s+(?:continua|mesmo|permanece)/i.test(norm)

  if (/^comunicado\b/im.test(norm) || /^comunicado\s*[:\-]/im.test(norm)) {
    tipo = 'COMUNICADO'
  } else if (/segunda\s+viagem|carro\s+j[áa]\s+escalado/i.test(norm)) {
    tipo = 'INFORMATIVO'
  } else if (isTrocaCarro && entra?.placa_norm && sai?.placa_norm) {
    tipo = 'SWAP'
  } else if (entra && sai) {
    tipo = 'SUBSTITUICAO'
  } else if (entra && !sai) {
    tipo = 'INCLUSAO'
  } else {
    tipo = 'COMUNICADO'
  }

  // Confiança: rede + ambas as placas → alta; rede + uma placa → media
  const temPlacas = (entra?.placa_norm ? 1 : 0) + (sai?.placa_norm ? 1 : 0)
  let confianca: 'alta' | 'media' | 'baixa'
  if (redeId && temPlacas === 2) confianca = 'alta'
  else if (redeId && temPlacas >= 1) confianca = 'media'
  else if (temPlacas === 2) confianca = 'media'
  else confianca = 'baixa'

  return { tipo, rede_id: redeId, loja_nome_raw: lojaRaw, entra, sai, motivo, texto_original: original, confianca }
}
