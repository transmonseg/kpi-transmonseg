// F2-13 (KRQ-12): aviso da tela Ao vivo quando o dia aberto foi calculado com
// outra versao das regras (sem dependencia de servidor; usado no cliente).

/** null = mesma versao ou sem como comparar (versao atual desconhecida). */
export function avisoVersaoRegras(doDia: string | null | undefined, atual: string | null | undefined): string | null {
  if (!atual) return null
  if (!doDia) return `Dia calculado sem registro da versão das regras (antes de 24/10): a taxa pode não ser comparável com a dos dias calculados com as regras atuais (${atual}).`
  if (doDia === atual) return null
  return `Dia calculado com as regras da versão ${doDia}; as regras atuais são da versão ${atual}. A taxa deste dia não é comparável direto com a dos dias calculados com outra versão.`
}
