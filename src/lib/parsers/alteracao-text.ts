// Parser de mensagens livres de alteração de escala (WhatsApp).
//
// Tipos suportados:
//  - SUBSTITUICAO  → tem entra: + sai:
//  - INCLUSAO      → só entra:
//  - COMUNICADO    → palavra "Comunicado" presente
//  - INFORMATIVO   → "segunda viagem" / "carro já escalado"
//  - SWAP          → dois carros trocando rotas (placeholder; detecção full requer correlação entre mensagens)
//
// Exemplo de entrada:
//   🚨ALTERAÇÃO 🚨
//   Prezunic Caxias centenário, Caxias centro
//   Entra: Sidnei 674 LQE5401
//   Sai : Anderson 811 LCE4337
//   Motivo: Pneu do caminhão furou

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

// Mapeamento substring (lowercase) → rede_id canônico
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
]

// Regex pra placa (aceita formato antigo ABC1234 / ABC-1234 / ABC 1234 e Mercosul ABC1D23 / ABC-1D23 / ABC 1D23)
const PLACA_RE = /\b([A-Z]{3}[\s-]?\d[A-Z0-9]\d{2}|[A-Z]{3}[\s-]?\d{4})\b/i

// Regex pra labels entra/sai (tolerante a maiúscula/minúscula e espaços extras)
const ENTRA_LABEL_RE = /^\s*entra\s*:?\s*[:\-]?\s*/i
const SAI_LABEL_RE = /^\s*sai\s*:?\s*[:\-]?\s*/i

// Regex pra detectar linhas tipo "Entra:" e "Sai:" com tolerância a espaço extra antes do ":"
const ENTRA_LINE_RE = /^\s*entra\s*:/i
const SAI_LINE_RE = /^\s*sai\s*:/i

// Motivo / Obs (tolerante a ".", ":")
const MOTIVO_RE = /^\s*(?:motivo|obs)\s*\.?\s*:?\s*(.+?)\s*$/i

function normalizaTexto(s: string): string {
  // Remove emojis (mantém letras com acentos), normaliza quebras e espaços
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
  // Remove placa do trecho antes de procurar código
  let t = trecho
  if (placaRaw) {
    const re = new RegExp(placaRaw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    t = t.replace(re, ' ')
  }
  // Códigos motorista: 2-6 dígitos. Preferir o último (depois do nome) ou primeiro que aparecer.
  const matches = t.match(/\b\d{2,6}\b/g)
  if (!matches || matches.length === 0) return null
  const n = parseInt(matches[0], 10)
  if (isNaN(n)) return null
  return n
}

function extraiNome(trecho: string, placaRaw: string | null, codigo: number | null): string | null {
  let t = trecho
  if (placaRaw) {
    const re = new RegExp(placaRaw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    t = t.replace(re, ' ')
  }
  if (codigo !== null) {
    const re = new RegExp(`\\b${codigo}\\b`, 'g')
    t = t.replace(re, ' ')
  }
  // Limpa pontuação solta
  t = t.replace(/[,;:/]/g, ' ').replace(/\s+/g, ' ').trim()
  return t.length > 1 ? t : null
}

function parseSlot(segmento: string): VeiculoSlot | null {
  const trim = segmento.trim()
  if (!trim) return null
  const placa = extraiPlaca(trim)
  const placaRaw = placa?.raw ?? null
  const placaNorm = placa?.norm ?? null
  const codigo = extraiCodigo(trim, placaRaw)
  const nome = extraiNome(trim, placaRaw, codigo)
  if (!placaNorm && !nome && codigo === null) return null
  return {
    motorista_nome: nome,
    motorista_codigo: codigo,
    placa_raw: placaRaw,
    placa_norm: placaNorm,
  }
}

function detectaRede(texto: string): string | null {
  const lower = texto.toLowerCase()
  for (const { pat, id } of REDE_MAP) {
    if (lower.includes(pat)) return id
  }
  return null
}

function detectaLoja(linhas: string[], redeId: string | null): string | null {
  // Procura a primeira linha que contenha pelo menos um pattern de rede e não seja label de entra/sai/motivo.
  for (const linha of linhas) {
    if (!linha) continue
    if (ENTRA_LINE_RE.test(linha)) continue
    if (SAI_LINE_RE.test(linha)) continue
    if (MOTIVO_RE.test(linha)) continue
    if (/altera[çc][aã]o|comunicado/i.test(linha)) continue
    const lower = linha.toLowerCase()
    if (redeId) {
      // Confirma que a linha contém algum pattern da rede detectada
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

  const redeId = detectaRede(norm)
  const lojaRaw = detectaLoja(linhas, redeId)

  let entra: VeiculoSlot | null = null
  let sai: VeiculoSlot | null = null
  let motivo: string | null = null

  for (const linha of linhas) {
    if (ENTRA_LINE_RE.test(linha)) {
      const seg = linha.replace(ENTRA_LABEL_RE, '')
      entra = parseSlot(seg)
      continue
    }
    if (SAI_LINE_RE.test(linha)) {
      const seg = linha.replace(SAI_LABEL_RE, '')
      sai = parseSlot(seg)
      continue
    }
    const mMot = linha.match(MOTIVO_RE)
    if (mMot) {
      // Remove possíveis pontos/colons soltos no início ("Obs:. texto" → "texto")
      motivo = mMot[1].replace(/^[.:\-\s]+/, '').trim()
      continue
    }
  }

  // Detecta tipo
  let tipo: AlteracaoParsed['tipo']
  if (/^comunicado\b/im.test(norm) || /^comunicado\s*[:\-]/im.test(norm)) {
    tipo = 'COMUNICADO'
  } else if (/segunda\s+viagem|carro\s+j[áa]\s+escalado/i.test(norm)) {
    tipo = 'INFORMATIVO'
  } else if (entra && sai) {
    tipo = 'SUBSTITUICAO'
  } else if (entra && !sai) {
    tipo = 'INCLUSAO'
  } else {
    // Fallback: se tem rede mas nenhum slot, classifica como COMUNICADO genérico
    tipo = 'COMUNICADO'
  }

  // Confiança
  let confianca: 'alta' | 'media' | 'baixa'
  if (tipo === 'SUBSTITUICAO' && entra?.placa_norm && sai?.placa_norm) {
    confianca = 'alta'
  } else if (redeId && (entra?.placa_norm || sai?.placa_norm)) {
    confianca = 'media'
  } else {
    confianca = 'baixa'
  }

  return {
    tipo,
    rede_id: redeId,
    loja_nome_raw: lojaRaw,
    entra,
    sai,
    motivo,
    texto_original: original,
    confianca,
  }
}
