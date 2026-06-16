import { apiPost } from './client'
import { normPlaca } from './frota'

/** atraso = minutos desde a última comunicação do rastreador (detector de sinal
 *  perdido / jammer). Permite explicar "sem dado" como "rastreador sem comunicar
 *  há X min" em vez de "sem rastreador" (que sugere ausência de equipamento). */
export type PosicaoApi = { cv: string; velocidade: number; ignicao: boolean; datagps: string; atraso: number }
export type MapaPosicoes = Record<string, PosicaoApi> // chave = placa normalizada

export async function buscarPosicoes(cvs: string[]): Promise<MapaPosicoes> {
  const d = (await apiPost('/mapa_servicos/posicoes/S/N', cvs)) as {
    Posicoes?: Array<{ veicucodigo: string; veicuplaca: string; posicvelocidade: string; posicignicao: string; datagps: string; atraso?: string }>
  } | null
  const mapa: MapaPosicoes = {}
  for (const p of d?.Posicoes ?? []) {
    mapa[normPlaca(p.veicuplaca)] = {
      cv: String(p.veicucodigo),
      velocidade: parseInt(p.posicvelocidade) || 0,
      ignicao: p.posicignicao === '1',
      datagps: p.datagps,
      atraso: parseInt(String(p.atraso ?? '')) || 0,
    }
  }
  return mapa
}
