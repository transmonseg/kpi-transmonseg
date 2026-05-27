import type { AlteracaoBloco } from './alteracoes-v2.types'
import type { AlteracaoParsed } from './alteracao-text'

function detectaTipo(bloco: AlteracaoBloco): AlteracaoParsed['tipo'] {
  const norm = bloco.raw
  const isTrocaCarro = /troca\s+de\s+carro|motorista\s+(?:continua|mesmo|permanece)/i.test(norm)

  if (/^comunicado\b/im.test(norm) || /^comunicado\s*[:\-]/im.test(norm)) return 'COMUNICADO'
  if (/segunda\s+viagem|carro\s+j[áa]\s+escalado/i.test(norm)) return 'INFORMATIVO'
  if (isTrocaCarro && bloco.entra?.placa_norm && bloco.sai?.placa_norm) return 'SWAP'
  if (bloco.entra && bloco.sai) return 'SUBSTITUICAO'
  if (bloco.entra && !bloco.sai) return 'INCLUSAO'
  return 'COMUNICADO'
}

export function blocoToParsed(bloco: AlteracaoBloco): AlteracaoParsed {
  return {
    tipo: detectaTipo(bloco),
    rede_id: bloco.rede_id,
    loja_nome_raw: bloco.loja_nome_raw,
    entra: bloco.entra ? {
      motorista_nome: bloco.entra.motorista_nome,
      motorista_codigo: bloco.entra.motorista_codigo,
      placa_raw: bloco.entra.placa_raw,
      placa_norm: bloco.entra.placa_norm,
    } : null,
    sai: bloco.sai ? {
      motorista_nome: bloco.sai.motorista_nome,
      motorista_codigo: bloco.sai.motorista_codigo,
      placa_raw: bloco.sai.placa_raw,
      placa_norm: bloco.sai.placa_norm,
    } : null,
    motivo: bloco.motivo,
    texto_original: bloco.raw,
    confianca: bloco.confianca,
  }
}
