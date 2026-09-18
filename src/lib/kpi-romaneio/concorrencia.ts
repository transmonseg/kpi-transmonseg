/** Igual a `Promise.all(itens.map(fn))`, mas com no maximo `limite` chamadas
 *  em andamento ao mesmo tempo. Mantem a ordem dos resultados. */
export async function mapComLimite<T, R>(
  itens: T[], limite: number, fn: (item: T, indice: number) => Promise<R>,
): Promise<R[]> {
  const resultados = new Array<R>(itens.length)
  let proximo = 0
  async function trabalhador(): Promise<void> {
    while (true) {
      const i = proximo++
      if (i >= itens.length) return
      resultados[i] = await fn(itens[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, trabalhador))
  return resultados
}
