import { apiPost } from './client'
import { normPlaca } from './frota'

export type PosicaoApi = { cv: string; velocidade: number; ignicao: boolean; datagps: string }
export type MapaPosicoes = Record<string, PosicaoApi> // chave = placa normalizada

export async function buscarPosicoes(cvs: string[]): Promise<MapaPosicoes> {
  const d = (await apiPost('/mapa_servicos/posicoes/S/N', cvs)) as {
    Posicoes?: Array<{ veicucodigo: string; veicuplaca: string; posicvelocidade: string; posicignicao: string; datagps: string }>
  } | null
  const mapa: MapaPosicoes = {}
  for (const p of d?.Posicoes ?? []) {
    mapa[normPlaca(p.veicuplaca)] = {
      cv: String(p.veicucodigo),
      velocidade: parseInt(p.posicvelocidade) || 0,
      ignicao: p.posicignicao === '1',
      datagps: p.datagps,
    }
  }
  return mapa
}
