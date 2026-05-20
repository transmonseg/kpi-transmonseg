export function normalizaNomeMotorista(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos (combining diacritical marks)
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ')
}

export function normalizaTexto(texto: string): string {
  if (!texto) return ''
  let t = texto
  // Remove emojis (BMP supplementary + diversos símbolos)
  t = t.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ' ')
  // Padroniza quebras de linha
  t = t.replace(/\r\n|\r/g, '\n')
  // Insere quebra antes de "Filial N" se não houver
  t = t.replace(/([^\n])\s+(?=Filial\s+\d)/gi, '$1\n')
  // Insere quebra antes de "Sai:" / "Entra:" se não houver
  // (mas não quando o token anterior é um número de filial)
  t = t.replace(/([^\n\d])\s+(?=(?:Sai|Entra|Saiu|Entrou)\s*:)/gi, '$1\n')
  // Colapsa espaços/tabs preservando \n
  t = t.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n')
  // Remove linhas vazias no início/fim
  t = t.replace(/^\n+/, '').replace(/\n+$/, '')
  return t
}
