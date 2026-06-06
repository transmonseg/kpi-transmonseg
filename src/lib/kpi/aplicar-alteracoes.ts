/**
 * Aplica alterações de escala (PDF/texto/manual) sobre uma lista de linhas
 * da escala, retornando a "escala efetiva" do dia.
 *
 * Regras importantes:
 *  - Snapshot anti-cascata: alterações posteriores usam estado ORIGINAL pra match,
 *    não estado modificado. Necessário pra SWAP mútuo (Filial 23↔43).
 *  - Filtra cross-rede: alteração de "PREZUNIC" não afeta linha "VIANENSE".
 *  - Tipos suportados: SUBSTITUICAO, INCLUSAO, SWAP. COMUNICADO/INFORMATIVO ignorados.
 *  - Match: por placa de saída, motorista de saída, OU loja_raw (ex: "Filial 23")
 *    quando não há info em "sai".
 */
import type { LinhaEscala } from '@/lib/types/escala'

export type AltConfirmada = {
  tipo: string
  rede_id: string | null
  loja_raw: string | null
  /** Carro da alteração (1 ou 2) — quando souber, casa SÓ a linha desse carro
   *  (senão o 2º carro sobrescreve o 1º numa loja com dois carros). */
  carro?: number | null
  entra: {
    motorista_nome: string | null
    motorista_codigo: number | null
    placa_raw: string | null
    placa_norm: string | null
  } | null
  sai: {
    motorista_nome: string | null
    placa_norm: string | null
  } | null
}

/** Extrai o nº do carro (1/2) de "2º CARRO" / "Filial 08 - 2° carro". */
export function extraiCarroAlt(s: string | null | undefined): number | null {
  if (!s) return null
  const m = s.match(/(\d)\s*[ºo°]?\s*carro/i) ?? s.match(/carro\s*(\d)/i)
  if (m) {
    const n = parseInt(m[1], 10)
    if (n === 1 || n === 2) return n
  }
  return null
}

export function aplicarAlteracoes(
  linhas: LinhaEscala[],
  alts: AltConfirmada[],
): LinhaEscala[] {
  if (alts.length === 0) return linhas

  // Snapshot original ANTES de qualquer mutação — usado pra match (evita cascata)
  const placasOriginais: (string | null)[] = linhas.map(l => l.placa_norm || null)
  const motoristasOriginais: (string | null)[] = linhas.map(l => l.motorista_nome || null)

  for (const alt of alts) {
    const tipoOk = alt.tipo === 'SUBSTITUICAO' || alt.tipo === 'INCLUSAO' || alt.tipo === 'SWAP'
    if (!tipoOk) continue
    if (!alt.entra) continue

    // Casa a LOJA (sem considerar o carro) — prioridades originais 1-4.
    const matchesLoja = (l: LinhaEscala, i: number): boolean => {
      // Filtra cross-rede
      if (alt.rede_id && l.rede_id !== alt.rede_id) return false

      // PRIORIDADE 1: número de loja EXPLÍCITO na loja_raw ("Loja N") — fonte de
      // verdade direto do PDF. (Antes morria porque a rota não preenchia loja_raw.)
      if (alt.loja_raw) {
        const filialExplicito = alt.loja_raw.match(/\b(?:Loja|Filial)\s+(\d{1,3})\b/i)
        const codInt = parseInt(l.loja_codigo_raw ?? '', 10)
        if (filialExplicito && !isNaN(codInt)) {
          return parseInt(filialExplicito[1], 10) === codInt
        }
      }

      // PRIORIDADE 2: match por placa do "sai" (snapshot original)
      if (alt.sai?.placa_norm && placasOriginais[i] === alt.sai.placa_norm) return true

      // PRIORIDADE 3: match por motorista do "sai"
      if (alt.sai?.motorista_nome) {
        const needle = alt.sai.motorista_nome.toLowerCase().split(' ')[0]
        if (needle.length >= 3 && motoristasOriginais[i]?.toLowerCase().includes(needle)) return true
      }

      // PRIORIDADE 4: tokens fortes do nome (sem "Loja N" nem info de sai). EXIGE
      // rede — sem ela um token genérico ("CAXIAS") casaria várias redes.
      if (alt.rede_id && !alt.sai?.placa_norm && !alt.sai?.motorista_nome && alt.loja_raw) {
        const norm = (s: string) =>
          s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
            .replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
        const STOP = new Set([
          'LOJA', 'FILIAL', 'CARRO', 'REDE', 'CARREFOUR', 'ASSAI', 'PREZUNIC',
          'PRINCESA', 'SUPERPRIX', 'SENDAS', 'GUANABARA', 'ATACADAO', 'VIANENSE',
          'MUNDIAL', 'EMANUEL', 'MEGA', 'BOX', 'ZONA', 'SUL', 'ARMAZEM',
          'PAX', 'FEIRA', 'NOVA', 'SAMS', 'CLUB', 'CAB', 'PETROPOLIS', 'SUPER',
        ])
        const tokensFortes = (s: string) =>
          norm(s).split(' ').filter(t => t.length >= 4 && !STOP.has(t))
        const altTok = tokensFortes(alt.loja_raw)
        if (altTok.length === 0) return false
        const linTok = new Set(tokensFortes(l.loja_nome_raw ?? ''))
        if (altTok.every(t => linTok.has(t))) return true
      }
      return false
    }
    // Carro: quando a alteração diz 1º/2º, casa SÓ a linha daquele carro. Linha
    // sem carro_ordem não filtra (não derruba match).
    const carroOk = (l: LinhaEscala): boolean =>
      alt.carro == null || l.carro_ordem == null || l.carro_ordem === alt.carro

    if (alt.tipo === 'SWAP') {
      // SWAP: só troca placa, motorista permanece. Aplica em UMA linha.
      for (let i = 0; i < linhas.length; i++) {
        if (!matchesLoja(linhas[i], i) || !carroOk(linhas[i])) continue
        const l = { ...linhas[i] }
        if (alt.entra.placa_norm) l.placa_norm = alt.entra.placa_norm
        if (alt.entra.placa_raw) l.placa_raw = alt.entra.placa_raw
        linhas[i] = l
        break
      }
      continue
    }

    // SUBSTITUICAO / INCLUSAO: aplica em todas as linhas que casarem loja+carro.
    let aplicou = false
    let template: LinhaEscala | null = null
    for (let i = 0; i < linhas.length; i++) {
      if (!matchesLoja(linhas[i], i)) continue
      if (template === null) template = linhas[i] // 1ª linha da loja (p/ clonar carro novo)
      if (!carroOk(linhas[i])) continue
      const l = { ...linhas[i] }
      if (alt.entra.placa_norm) l.placa_norm = alt.entra.placa_norm
      if (alt.entra.placa_raw) l.placa_raw = alt.entra.placa_raw
      if (alt.entra.motorista_nome) l.motorista_nome = alt.entra.motorista_nome
      if (alt.entra.motorista_codigo !== null && alt.entra.motorista_codigo !== undefined)
        l.motorista_codigo = String(alt.entra.motorista_codigo)
      linhas[i] = l
      aplicou = true
    }
    // Carro NOVO: alteração pra um carro que não existe na escala da loja →
    // adiciona uma linha clonando o contexto da loja (template). Sem template
    // (loja fora da escala) não dá pra adicionar — fica pro operador.
    if (!aplicou && alt.carro != null && template !== null) {
      linhas.push({
        ...template,
        carro_ordem: alt.carro === 1 || alt.carro === 2 ? alt.carro : template.carro_ordem,
        motorista_nome: alt.entra.motorista_nome ?? template.motorista_nome,
        motorista_codigo: alt.entra.motorista_codigo != null ? String(alt.entra.motorista_codigo) : null,
        placa_norm: alt.entra.placa_norm ?? '',
        placa_raw: alt.entra.placa_raw ?? null,
      })
    }
  }
  return linhas
}

/**
 * Converte AlteracaoParsed (output dos parsers PDF/texto) em AltConfirmada
 * (input de aplicarAlteracoes).
 */
export function parsedToConfirmada(
  parsed: {
    tipo: string
    rede_id: string | null
    loja_nome_raw: string | null
    motivo?: string | null
    carro?: number | null
    entra: { motorista_nome: string | null; motorista_codigo: number | null; placa_raw: string | null; placa_norm: string | null } | null
    sai: { motorista_nome: string | null; placa_norm: string | null } | null
  }
): AltConfirmada {
  return {
    tipo: parsed.tipo,
    rede_id: parsed.rede_id,
    loja_raw: parsed.loja_nome_raw,
    carro: parsed.carro ?? extraiCarroAlt(parsed.motivo) ?? extraiCarroAlt(parsed.loja_nome_raw),
    entra: parsed.entra,
    sai: parsed.sai,
  }
}
