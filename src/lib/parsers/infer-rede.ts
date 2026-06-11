function normText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
}

/**
 * Infere rede_id a partir do nome da loja (texto livre da escala).
 * Retorna 'DESCONHECIDO' quando não reconhece.
 * Extraída de escala-geral.ts para reuso no parser universal.
 */
export function inferRedeFromLoja(nome: string): string {
  const n = normText(nome)
  if (n.includes('ASSAI')) return 'ASSAI'
  if (n.includes('ATACADAO')) return 'ATACADAO'
  if (n.includes('CARREFOUR')) return 'CARREFOUR'
  if (n.includes('PREZUNIC')) return 'PREZUNIC'
  if (n.includes('PRINCESA')) return 'PRINCESA'
  if (n.includes('GUANABARA')) return 'GUANABARA'
  if (n.includes("SAM'S") || n.includes('SAMS')) return 'SAMS_CLUB'
  if (n.includes('VIANENSE')) return 'VIANENSE'
  if (n.includes('CAB') && n.includes('PETROPOLIS')) return 'CAB_PETROPOLIS'
  if (n.includes('SENDAS')) return 'SENDAS'
  if (n.includes('FEIRA NOVA')) return 'FEIRA_NOVA'
  if (n.includes('EMANUEL')) return 'EMANUEL'
  if (n.includes('ARMAZEM') && n.includes('GRAO')) return 'ARMAZEM_GRAO'
  if (n.includes('SUPER PAX') || n.includes('SUPERPAX')) return 'SUPER_PAX'
  if (n.includes('SUPERCOMPRAS')) return 'SUPERCOMPRAS'
  if (n.includes('SUPER PRIX') || n.includes('SUPERPRIX')) return 'SUPERPRIX'
  if (n.includes('MUNDIAL')) return 'MUNDIAL'
  if (n.includes('ZONA SUL') || n.includes('ZONA_SUL')) return 'ZONA_SUL'
  return 'DESCONHECIDO'
}
