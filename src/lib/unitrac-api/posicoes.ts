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

// Relatorio rq-mesmo-lugar-e-sem-rastreador.md (01/10): a variante /N/N
// devolve placa + empresa (emprecodigo) + datagps de QUALQUER CV, ate' 500 por
// chamada; a /S/N acima omite parte dos veiculos (KND2D45, KVU6307, LNH8A80
// voltam vazios). Usada pela Rio Quality (ultima comunicacao do rastreador e
// descoberta de CV). Erro/timeout LANCA (nunca vira "sem posicao" calado).
export type PosicaoPorCv = { cv: string; placa: string; empresa: string; datagps: string | null; lat: number | null; lng: number | null }
export const LOTE_POSICOES_POR_CV = 500

export async function buscarPosicoesPorCv(cvs: string[]): Promise<Map<string, PosicaoPorCv>> {
  const out = new Map<string, PosicaoPorCv>()
  for (let i = 0; i < cvs.length; i += LOTE_POSICOES_POR_CV) {
    const lote = cvs.slice(i, i + LOTE_POSICOES_POR_CV)
    const d = (await apiPost('/mapa_servicos/posicoes/N/N', lote)) as { Posicoes?: unknown } | null
    if (d == null || !Array.isArray(d.Posicoes)) throw new Error(`consulta /posicoes/N/N da Unitrac falhou (lote ${i / LOTE_POSICOES_POR_CV + 1})`)
    for (const p of d.Posicoes as Array<Record<string, unknown>>) {
      const cv = String(p.veicucodigo ?? '')
      if (!cv) continue
      const num = (v: unknown) => { const n = parseFloat(String(v ?? '')); return Number.isFinite(n) ? n : null }
      out.set(cv, {
        cv,
        placa: normPlaca(String(p.veicuplaca ?? '')),
        empresa: String(p.emprecodigo ?? ''),
        datagps: typeof p.datagps === 'string' && p.datagps ? p.datagps : null,
        lat: num(p.posiclatitude),
        lng: num(p.posiclongitude),
      })
    }
  }
  return out
}
