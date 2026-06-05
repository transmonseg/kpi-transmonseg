// Parser HEURÍSTICO (sem IA) de alteração colada como texto LIVRE — frase solta,
// lista, ou texto grudado. Estratégia: ancora na PLACA (sinal forte e inequívoco),
// casa a LOJA contra o cadastro (ctx), e extrai o MOTORISTA do resto.
//
// Roda em conjunto com o parser de prosa (parseAlteracoesV2); o endpoint mescla os
// dois e deduplica. Quando falta loja, a confiança cai e a UI mostra o aviso
// "não consegui identificar".

import type { ParseContext } from './alteracoes-v2.types'
import type { AlteracaoParsed } from './alteracao-text'
import { normalizaPlaca } from '@/lib/utils/placa'

const PLACA_RE = /[A-Z]{3}[-\s]?\d[A-Z0-9]\d{2}/gi

// Palavras de função / rótulos que NÃO são nome de motorista nem de loja.
const STOP = new Set([
  'NA', 'NO', 'EM', 'HOJE', 'VAI', 'VAO', 'IRA', 'PLACA', 'MOTORISTA', 'CARRO',
  'ENTRA', 'ENTROU', 'SAI', 'SAIU', 'OS', 'AS', 'DO', 'DA', 'DOS', 'DAS', 'DE',
  'PARA', 'PRA', 'COM', 'AGORA', 'TROCA', 'TROCAR', 'TROCOU', 'REDE', 'LOJA',
  'FILIAL', 'VEICULO', 'CAMINHAO', 'COD', 'CODIGO', 'NOME', 'NOVO', 'NOVA',
  'SUBSTITUI', 'SUBSTITUICAO', 'ALTERACAO', 'ESCALA',
])

// Tokens genéricos (estruturais + nomes de rede) que NÃO discriminam uma loja —
// não podem, sozinhos, casar uma loja específica (senão "uma loja qualquer" casaria
// qualquer loja só pelo token "LOJA").
const GENERICOS = new Set([
  'LOJA', 'FILIAL', 'FILIAIS', 'REDE', 'SUPER', 'PRIX', 'MERCADO', 'SUPERMERCADO',
  'ATACADO', 'ATACADAO', 'SUPERMARKET', 'PAX', 'FEIRA', 'NOVA', 'MEGA', 'SAMS',
  'CLUB', 'ZONA', 'ARMAZEM', 'GRAO', 'ASSAI', 'PREZUNIC', 'PRINCESA', 'CARREFOUR',
  'SENDAS', 'SUPERPRIX', 'GUANABARA', 'VIANENSE', 'MUNDIAL', 'EMANUEL', 'PETROPOLIS', 'CAB',
])

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

function soLetras(tokenRaw: string): boolean {
  return /^[A-Za-zÀ-ÿ.]{3,}$/.test(tokenRaw)
}

// Casa o trecho contra as lojas do ctx por sobreposição de tokens fortes (≥4 chars).
function casaLoja(trecho: string, ctx: ParseContext): ParseContext['lojas'][number] | null {
  const t = ' ' + norm(trecho) + ' '
  let best: ParseContext['lojas'][number] | null = null
  let bestScore = 0
  for (const l of ctx.lojas) {
    const toks = l.nome_norm.split(' ').filter(w => w.length >= 4 && !GENERICOS.has(w))
    if (toks.length === 0) continue
    const hit = toks.filter(w => t.includes(' ' + w + ' ') || t.includes(' ' + w)).length
    if (hit > bestScore) { bestScore = hit; best = l }
  }
  return bestScore > 0 ? best : null
}

export function parseAlteracaoTextoLivre(texto: string, ctx: ParseContext): AlteracaoParsed[] {
  const out: AlteracaoParsed[] = []
  const linhas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean)

  for (const linha of linhas) {
    const placas = linha.match(PLACA_RE)
    if (!placas) continue

    for (const placaRaw of placas) {
      const placa_norm = normalizaPlaca(placaRaw)
      // Remove a placa do trecho pra isolar loja / código / motorista.
      const semPlaca = linha.replace(placaRaw, ' ')
      const loja = casaLoja(semPlaca, ctx)
      const lojaToks = new Set(loja ? loja.nome_norm.split(' ') : [])

      // Código: 2-7 dígitos que sobraram (placa já removida).
      const codM = semPlaca.match(/\b(\d{2,7})\b/)
      const codigo = codM ? parseInt(codM[1], 10) : null

      // Motorista: tokens que parecem nome (≥3 letras), preservando acento,
      // descartando stopwords, tokens da loja e qualquer coisa com dígito.
      const nameTokens: string[] = []
      for (const tokRaw of semPlaca.split(/\s+/)) {
        if (!soLetras(tokRaw) || /\d/.test(tokRaw)) continue
        const t = norm(tokRaw)
        if (!t || t.length < 3 || STOP.has(t) || lojaToks.has(t)) continue
        nameTokens.push(tokRaw.replace(/[.,;]+$/, ''))
      }
      const motorista = nameTokens.slice(0, 3).join(' ') || null

      out.push({
        tipo: 'SUBSTITUICAO',
        rede_id: loja?.rede_id ?? null,
        loja_nome_raw: loja?.nome ?? null,
        entra: {
          motorista_nome: motorista,
          motorista_codigo: codigo,
          placa_raw: placaRaw.toUpperCase().replace(/\s/g, ''),
          placa_norm,
        },
        sai: null,
        motivo: null,
        texto_original: linha,
        confianca: loja && placa_norm ? 'alta' : placa_norm ? 'media' : 'baixa',
      })
    }
  }
  return out
}
