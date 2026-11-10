// 09/11: lê as conferências vigentes do dia (servidor) para aplicar no Ao vivo.
import { buscarResolucoes, vigentesPorNf } from './resolucoes'
import { empresaDaResolucao, type ClienteConferencia } from './fila-conferir'
import { aplicarConferenciasAoVivo, type ConferenciaVigente } from './ao-vivo-conferencia'

export async function conferenciasVigentes(cliente: ClienteConferencia, data: string): Promise<ConferenciaVigente[]> {
  const linhas = await buscarResolucoes(empresaDaResolucao(cliente), data)
  return [...vigentesPorNf(linhas).values()].map(r => ({ nf: r.nf, resolucao: r.resolucao, responsavel: r.responsavel, criadoEm: r.criado_em, placaExecutora: r.placa_executora }))
}

/** Resultado com as conferências aplicadas. Falha de leitura não derruba a
 *  tela: devolve o automático e registra no log. */
export async function comConferencias<R extends Parameters<typeof aplicarConferenciasAoVivo>[0]>(cliente: ClienteConferencia, data: string, r: R | null): Promise<(R & { marca: string }) | null> {
  if (!r) return null
  try {
    return aplicarConferenciasAoVivo(r, await conferenciasVigentes(cliente, data))
  } catch (e) {
    console.error(`[conferencia] ${cliente} ${data}: leitura falhou, tela fica com o automático:`, e)
    return { ...r, marca: r.calculadoEm }
  }
}
