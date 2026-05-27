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

    const matches = (l: LinhaEscala, i: number): boolean => {
      // Filtra cross-rede
      if (alt.rede_id && l.rede_id !== alt.rede_id) return false

      // PRIORIDADE 1: match por numero de loja EXPLICITO na loja_raw da alteracao.
      //
      // Bug D dia 25 (auditoria 2026-05-27): quando a alteracao vem com "Loja N"
      // explicito (do PDF tabular), esse numero E fonte de verdade direto do
      // documento. Inferencias de sai (motorista/placa via banco) podem dar
      // resultado errado e jogar a alteracao em loja diferente. Priorizar
      // numero explicito da alteracao previne contaminacao.
      if (alt.loja_raw) {
        const filialExplicito = alt.loja_raw.match(/\b(?:Loja|Filial)\s+(\d{1,3})\b/i)
        const codInt = parseInt(l.loja_codigo_raw ?? '', 10)
        if (filialExplicito && !isNaN(codInt)) {
          const filialInt = parseInt(filialExplicito[1], 10)
          // Match estrito: aceita SOMENTE a linha com o mesmo numero. Nao cai
          // em outros matches por placa do sai.
          return filialInt === codInt
        }
      }

      // PRIORIDADE 2: match por placa do "sai" (snapshot original)
      // Usado quando alteracao nao tem "Loja N" explicito (texto WhatsApp curto)
      if (alt.sai?.placa_norm && placasOriginais[i] === alt.sai.placa_norm) return true

      // PRIORIDADE 3: match por motorista do "sai"
      if (alt.sai?.motorista_nome) {
        const needle = alt.sai.motorista_nome.toLowerCase().split(' ')[0]
        if (needle.length >= 3 && motoristasOriginais[i]?.toLowerCase().includes(needle)) return true
      }

      // PRIORIDADE 4: match por loja_raw via tokens fortes do nome (quando
      // nao ha "Loja N" explicito nem info de "sai").
      // Caso "Carrefour Campo Grande" / "Assai Sao Goncalo Camil" sem numero.
      if (!alt.sai?.placa_norm && !alt.sai?.motorista_nome && alt.loja_raw) {
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

    if (alt.tipo === 'SWAP') {
      // SWAP: só troca placa, motorista permanece. Aplica em UMA linha (a primeira que casar).
      for (let i = 0; i < linhas.length; i++) {
        if (!matches(linhas[i], i)) continue
        const l = { ...linhas[i] }
        if (alt.entra.placa_norm) l.placa_norm = alt.entra.placa_norm
        if (alt.entra.placa_raw) l.placa_raw = alt.entra.placa_raw
        linhas[i] = l
        break
      }
    } else {
      // SUBSTITUICAO / INCLUSAO: aplica em todas linhas que casarem (placa pode servir
      // múltiplas lojas)
      for (let i = 0; i < linhas.length; i++) {
        if (!matches(linhas[i], i)) continue
        const l = { ...linhas[i] }
        if (alt.entra.placa_norm) l.placa_norm = alt.entra.placa_norm
        if (alt.entra.placa_raw) l.placa_raw = alt.entra.placa_raw
        if (alt.entra.motorista_nome) l.motorista_nome = alt.entra.motorista_nome
        if (alt.entra.motorista_codigo !== null && alt.entra.motorista_codigo !== undefined)
          l.motorista_codigo = String(alt.entra.motorista_codigo)
        linhas[i] = l
      }
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
    entra: { motorista_nome: string | null; motorista_codigo: number | null; placa_raw: string | null; placa_norm: string | null } | null
    sai: { motorista_nome: string | null; placa_norm: string | null } | null
  }
): AltConfirmada {
  return {
    tipo: parsed.tipo,
    rede_id: parsed.rede_id,
    loja_raw: parsed.loja_nome_raw,
    entra: parsed.entra,
    sai: parsed.sai,
  }
}
