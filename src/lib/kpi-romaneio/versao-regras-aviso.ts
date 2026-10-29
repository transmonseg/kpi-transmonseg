// F2-13 (KRQ-12): aviso da tela Ao vivo quando o dia aberto foi calculado com
// outra versao das regras (sem dependencia de servidor; usado no cliente).

/** null = mesma versao ou sem como comparar (versao atual desconhecida). */
export function avisoVersaoRegras(doDia: string | null | undefined, atual: string | null | undefined): string | null {
  if (!atual) return null
  // Grupo KPI AJUSTES 24/10: a operação não entendia o hash das versões --
  // texto simples aqui; as versões ficam no title do aviso (page.tsx).
  if (!doDia) return 'Este dia foi calculado antes da atualização das regras de 24/10. A taxa dele pode não bater com a dos dias mais novos.'
  if (doDia === atual) return null
  return 'Este dia foi calculado com regras anteriores às atuais. A taxa dele pode não bater com a dos dias mais novos.'
}
