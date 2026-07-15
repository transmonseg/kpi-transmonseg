import { buscarFrota, normPlaca } from '@/lib/unitrac-api/frota'
import { buscarAlvos } from '@/lib/unitrac-api/alvos'
import { COD_USER_NUTRIMAX } from '@/lib/unitrac-api/client'
import type { LinhaRomaneioNutrimax, EntradaNutrimax } from './types'

function statusPorSituacao(situacao: number | undefined): EntradaNutrimax['status'] {
  if (situacao === 1) return 'entregue'
  if (situacao === 98) return 'confirmado_indireto'
  return 'pendente'
}

export async function cruzaRomaneioAlvosNutrimax(
  linhas: LinhaRomaneioNutrimax[],
  data: string,
): Promise<EntradaNutrimax[]> {
  const frota = await buscarFrota(COD_USER_NUTRIMAX)
  const cvs = frota.map(v => v.cv)
  const alvos = cvs.length > 0 ? await buscarAlvos(cvs) : []

  const porPlacaNf = new Map(
    alvos.filter(a => a.documento).map(a => [`${a.placaNorm}:${a.documento}`, a]),
  )
  const placasComSinal = new Set(alvos.map(a => a.placaNorm))

  const cargasPorPlaca = new Map<string, Set<string>>()
  for (const l of linhas) {
    const placaNorm = normPlaca(l.placa)
    const set = cargasPorPlaca.get(placaNorm) ?? new Set<string>()
    set.add(l.carga)
    cargasPorPlaca.set(placaNorm, set)
  }

  return linhas.map((l): EntradaNutrimax => {
    const placaNorm = normPlaca(l.placa)
    const alvo = porPlacaNf.get(`${placaNorm}:${l.nf}`)
    return {
      data,
      carga: l.carga,
      destino: l.destino,
      placa: placaNorm,
      motorista: l.motorista || null,
      nf: l.nf,
      cliente_codigo: l.clienteCodigo || null,
      cliente_nome: l.clienteNome,
      endereco: l.endereco || null,
      status: statusPorSituacao(alvo?.situacao),
      hora_realizado: alvo?.feitoISO ?? null,
      placa_rastreada: placasComSinal.has(placaNorm),
      placa_duplicada: (cargasPorPlaca.get(placaNorm)?.size ?? 0) > 1,
    }
  })
}
