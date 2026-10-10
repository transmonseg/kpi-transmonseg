// Troca de placa informada pela operação (tela "Placas do dia", 05/10):
// "a carga da placa X da escala foi feita pela placa Y". Aplicada logo depois
// do parse da Escala/Romaneio, antes de tudo -- o resto da geração já vê a
// placa que realmente rodou.
import { normPlaca } from '@/lib/unitrac-api'

export type TrocaPlaca = { carga: string | null; placaEscala: string; placaReal: string }

export function normalizarPlacaDigitada(s: string): string {
  return normPlaca(s.trim())
}

const PLACA_INTEIRA = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/

/** Placa digitada inteira ou só o final ("9C84", como a operação escreve no
 *  grupo): completa pela frota quando o final é único. */
export function completarPlaca(digitada: string, frota: string[]): { placa: string } | { erro: string } {
  const p = normalizarPlacaDigitada(digitada)
  if (PLACA_INTEIRA.test(p)) return { placa: p }
  if (p.length < 3 || p.length > 6) return { erro: 'Placa inválida.' }
  const achadas = [...new Set(frota.map(normPlaca))].filter(f => PLACA_INTEIRA.test(f) && f.endsWith(p))
  if (achadas.length === 1) return { placa: achadas[0] }
  if (achadas.length === 0) return { erro: `Nenhuma placa da frota termina em ${p}.` }
  return { erro: `Mais de uma placa termina em ${p} (${achadas.slice(0, 4).join(', ')}). Digite a placa inteira.` }
}

/** Placa digitada na tela -> placa inteira. Inteira não consulta a frota; só o
 *  final consulta (fail-open: frota fora do ar vira pedido de placa inteira). */
export async function resolverPlacaDigitada(
  digitada: string,
  buscarFrota: () => Promise<string[]>,
): Promise<{ placa: string } | { erro: string }> {
  const direta = completarPlaca(digitada, [])
  if ('placa' in direta || direta.erro === 'Placa inválida.') return direta
  const frota = await buscarFrota().catch(() => [] as string[])
  if (frota.length === 0) return { erro: 'Não consegui consultar a frota agora. Digite a placa inteira.' }
  return completarPlaca(digitada, frota)
}

/** Substitui placaEscala -> placaReal no romaneio e na escala. Troca com
 *  `carga` só vale pra aquela carga; sem carga, pra todas da placa no dia.
 *  Várias trocas pra mesma placa/carga: a última da lista vence. */
export function aplicarTrocasDePlaca<
  R extends { carga: string; placa: string },
  E extends { carga: string; placaRaw: string; placaNorm: string },
>(romaneio: R[], escala: E[], trocas: TrocaPlaca[]): { romaneio: R[]; escala: E[]; aplicadas: number } {
  const destino = (carga: string, placa: string): string | null => {
    const p = normPlaca(placa)
    let real: string | null = null
    for (const t of trocas) {
      if (normPlaca(t.placaEscala) !== p) continue
      if (t.carga != null && t.carga.trim() !== '' && t.carga.trim() !== carga.trim()) continue
      real = normPlaca(t.placaReal)
    }
    return real
  }
  let aplicadas = 0
  const novoRomaneio = romaneio.map(l => {
    const real = destino(l.carga, l.placa)
    if (!real) return l
    aplicadas++
    return { ...l, placa: real }
  })
  const novaEscala = escala.map(e => {
    const real = destino(e.carga, e.placaNorm)
    return real ? { ...e, placaRaw: real, placaNorm: real } : e
  })
  return { romaneio: novoRomaneio, escala: novaEscala, aplicadas }
}

/** Trocas registradas pra empresa/dia. Falha de leitura NÃO quebra a geração
 *  (devolve vazio) -- mesmo padrão fail-open de buscarPlacasSemRastreador. */
export async function buscarTrocasDoDia(empresa: string, data: string): Promise<TrocaPlaca[]> {
  try {
    const { createServiceClient } = await import('@/lib/supabase/service')
    const { data: linhas, error } = await createServiceClient()
      .from('kpi_troca_placa')
      .select('carga, placa_escala, placa_real')
      .eq('empresa', empresa)
      .eq('data', data)
      .order('criado_em', { ascending: true })
    if (error) throw new Error(error.message)
    return (linhas ?? []).map(l => ({ carga: l.carga as string | null, placaEscala: l.placa_escala as string, placaReal: l.placa_real as string }))
  } catch (err) {
    console.error('trocas de placa indisponivel:', err)
    return []
  }
}

export type DecisaoTrocaManual =
  | { acao: 'inserir' | 'atualizar' | 'desfazer'; placaEscala: string; placaReal: string; moverNoMonitoramentoDe: string }
  | { erro: string }

/** Campo "redirecionar carga pra outra placa" (08/10, ideia do cliente): a
 *  operação escolhe a carga e digita a placa que de fato rodou. A tela mostra
 *  a placa JÁ trocada, então com troca existente a escala é a original dela e
 *  voltar pra ela desfaz. `moverNoMonitoramentoDe` = placa que tem as NFs hoje. */
export function decidirTrocaManual(
  existente: { placaEscala: string; placaReal: string } | null,
  placaDaTela: string,
  placaNova: string,
): DecisaoTrocaManual {
  const nova = normalizarPlacaDigitada(placaNova)
  const atual = existente ? normalizarPlacaDigitada(existente.placaReal) : normalizarPlacaDigitada(placaDaTela)
  if (!nova || nova === atual) return { erro: 'A placa nova é a mesma da carga.' }
  if (!existente) return { acao: 'inserir', placaEscala: atual, placaReal: nova, moverNoMonitoramentoDe: atual }
  const escala = normalizarPlacaDigitada(existente.placaEscala)
  return { acao: nova === escala ? 'desfazer' : 'atualizar', placaEscala: escala, placaReal: nova, moverNoMonitoramentoDe: atual }
}
