// Carga da tela Ao vivo pela rede (07/10): o resultado tem ~900 KB e só muda a
// cada 10 min, mas a tela pergunta a cada 60 s. Numa internet instável (o
// escritório da Nutry às 18h) quase toda pergunta caía no meio da resposta e a
// tela trocava tudo por "Failed to fetch". Agora a tela diz qual cálculo já tem
// e o servidor só manda o resultado de novo quando ele mudou; e uma falha de
// rede mantém os dados que já estão na tela.

type ComResultado = { resultado: { calculadoEm: string } | null }

/** Servidor: se a tela já tem este cálculo, devolve sem o resultado (marcado como inalterado). */
export function semResultadoSeIgual<T extends ComResultado>(estado: T, tenho: string | null): T & { resultadoInalterado?: true } {
  if (tenho && estado.resultado && estado.resultado.calculadoEm === tenho) {
    return { ...estado, resultado: null, resultadoInalterado: true }
  }
  return estado
}

/** Tela: resposta inalterada reaproveita o resultado que já estava na tela. */
export function juntarEstado<T extends ComResultado>(anterior: T | null, novo: T & { resultadoInalterado?: true }): T {
  const { resultadoInalterado, ...resto } = novo
  if (resultadoInalterado && anterior?.resultado) return { ...(resto as unknown as T), resultado: anterior.resultado }
  return resto as unknown as T
}

/** Mensagem pra falha da busca: erro de rede vira texto que a pessoa entende. */
export function mensagemFalhaCarga(e: unknown, temDados: boolean): string {
  const msg = e instanceof Error ? e.message : ''
  const rede = e instanceof TypeError || /failed to fetch|networkerror|load failed|network/i.test(msg)
  if (rede) {
    return temDados
      ? 'Sem conexão com o servidor agora. A tela continua com os últimos dados e tenta de novo sozinha.'
      : 'Sem conexão com o servidor agora. Tentando de novo em alguns segundos.'
  }
  return msg || 'Não consegui carregar.'
}
