// F3-05 (AC-13): o que a tela Gerar KPI diz depois de gerar, lendo os
// cabeçalhos x-ao-vivo / x-monitoramento da resposta. null = nada a dizer
// (dia passado).
export function textoPortaDoDia(aoVivo: string | null, monitoramento: string | null, cliente: 'nutrimax' | 'rioquality'): string | null {
  if (aoVivo === 'gravado') {
    if (monitoramento === 'falhou') {
      return cliente === 'rioquality'
        ? 'O dia também foi para o Ao vivo, mas o monitoramento não recebeu — suba a planilha de novo no Ao vivo.'
        : 'O dia também foi para o Ao vivo, mas o monitoramento não recebeu — o sistema tenta de novo em até 10 minutos.'
    }
    return 'O dia também foi para o Ao vivo e o monitoramento.'
  }
  if (aoVivo === 'igual') return 'O Ao vivo já tinha este romaneio — nada foi enviado de novo.'
  if (aoVivo === 'falhou') {
    return cliente === 'rioquality'
      ? 'Não consegui pôr o dia no Ao vivo agora — suba a planilha no Ao vivo.'
      : 'Não consegui pôr o dia no Ao vivo agora — o sistema tenta de novo em até 10 minutos.'
  }
  return null
}

/** Dia anterior em YYYY-MM-DD (a tela Gerar abre no dia passado: o de hoje é no Ao vivo). */
export function diaAnterior(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}
