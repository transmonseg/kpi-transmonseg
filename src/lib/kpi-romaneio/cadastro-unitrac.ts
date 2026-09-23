// Regra 1 (23/09): o cadastro do cliente na Unitrac (pontoLat/pontoLng) so'
// vira coordenada do nosso cache quando uma parada GPS REAL da mesma placa,
// no horario do "feito", esta a ate' 300m dele -- a parada confirma o cadastro.
// Sem essa confirmacao o cadastro nao e' usado (tem erro conhecido).
import { haversine } from '@/lib/utils/geo'
import type { AlvoApi } from '@/lib/unitrac-api'
import type { ParadaBridge } from './base-horarios'
import { acessoSomentePorBarco } from './acesso-restrito'
import { ENDERECO_NAO_IDENTIFICADO, LIMITE_PARADA_ENTREGA_MIN, LIMITE_PARADAS_MESMO_ENDERECO_M, instanteDeFeitoISO, type EntregaParaCorrigir } from './correcao-por-alvo'

export const RAIO_CADASTRO_CONFIRMADO_M = 300
export const LIMITE_NOSSA_COORD_LONGE_M = 500
const TOLERANCIA_FEITO_MS = 10 * 60_000

export type SugestaoCadastro = {
  endereco: string; nfs: string[]; placaNorm: string
  latAtual: number | null; lngAtual: number | null; distAtualM: number | null; fonteAtual: string | null
  latNova: number; lngNova: number; codigoUnitrac: string; distParadaM: number
}
export type MotivoRejeicaoCadastro = 'endereco_nao_identificado' | 'correcao_manual' | 'ilha' | 'sem_alvo_feito' | 'cadastro_invalido' | 'cadastro_nao_confirmado' | 'coordenada_atual_ok' | 'cadastros_conflitantes'
export type RejeicaoCadastro = { endereco: string; nf: string; placaNorm: string; motivo: MotivoRejeicaoCadastro }

const coordValida = (lat: number | null | undefined, lng: number | null | undefined): lat is number =>
  typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)

/** paradasPorPlaca na convencao MASCARADA (digitos BRT + Z falso), a mesma de
 *  sugerirCorrecoesPorAlvo/instanteDeFeitoISO. */
export function sugerirCadastroUnitrac(
  entregas: EntregaParaCorrigir[],
  alvos: AlvoApi[],
  paradasPorPlaca: Map<string, ParadaBridge[]>,
): { sugestoes: SugestaoCadastro[]; rejeicoes: RejeicaoCadastro[] } {
  const rejeicoes: RejeicaoCadastro[] = []
  const rejeitar = (e: EntregaParaCorrigir, motivo: MotivoRejeicaoCadastro) =>
    rejeicoes.push({ endereco: e.endereco, nf: e.nf, placaNorm: e.placaNorm, motivo })

  const alvoPorChave = new Map<string, AlvoApi[]>()
  for (const a of alvos) {
    if (a.situacao !== 1 || !a.feitoISO || !a.documento) continue
    const k = `${a.placaNorm}|${a.documento}`
    alvoPorChave.set(k, [...(alvoPorChave.get(k) ?? []), a])
  }

  type Ok = { e: EntregaParaCorrigir; a: AlvoApi; distParadaM: number }
  const porEndereco = new Map<string, Ok[]>()
  for (const e of entregas) {
    if (e.endereco.trim() === ENDERECO_NAO_IDENTIFICADO) { rejeitar(e, 'endereco_nao_identificado'); continue }
    if (e.fonteAtual === 'manual') { rejeitar(e, 'correcao_manual'); continue }
    if (acessoSomentePorBarco(e.endereco)) { rejeitar(e, 'ilha'); continue }
    const alvosNf = alvoPorChave.get(`${e.placaNorm}|${e.nf}`)
    if (!alvosNf) { rejeitar(e, 'sem_alvo_feito'); continue }
    const a = alvosNf[0]
    if (!coordValida(a.pontoLat, a.pontoLng)) { rejeitar(e, 'cadastro_invalido'); continue }
    const t = instanteDeFeitoISO(a.feitoISO as string)
    let melhor = Infinity
    for (const p of paradasPorPlaca.get(e.placaNorm) ?? []) {
      if (p.classificacao !== 'FORA_BASE') continue
      if (p.duracaoSeg / 60 > LIMITE_PARADA_ENTREGA_MIN) continue
      if (Date.parse(p.chegada) - TOLERANCIA_FEITO_MS > t || t > Date.parse(p.saida) + TOLERANCIA_FEITO_MS) continue
      const d = haversine(a.pontoLat, a.pontoLng as number, p.lat, p.lng)
      if (d < melhor) melhor = d
    }
    if (melhor > RAIO_CADASTRO_CONFIRMADO_M) { rejeitar(e, 'cadastro_nao_confirmado'); continue }
    const temNossa = coordValida(e.latAtual, e.lngAtual)
    const distAtual = temNossa ? haversine(e.latAtual as number, e.lngAtual as number, a.pontoLat, a.pontoLng as number) : null
    if (distAtual != null && distAtual <= LIMITE_NOSSA_COORD_LONGE_M) { rejeitar(e, 'coordenada_atual_ok'); continue }
    porEndereco.set(e.endereco, [...(porEndereco.get(e.endereco) ?? []), { e, a, distParadaM: melhor }])
  }

  const sugestoes: SugestaoCadastro[] = []
  for (const [endereco, lista] of porEndereco) {
    let conflito = false
    for (let i = 0; i < lista.length && !conflito; i++) for (let j = i + 1; j < lista.length; j++) {
      if (haversine(lista[i].a.pontoLat as number, lista[i].a.pontoLng as number, lista[j].a.pontoLat as number, lista[j].a.pontoLng as number) > LIMITE_PARADAS_MESMO_ENDERECO_M) { conflito = true; break }
    }
    if (conflito) { for (const o of lista) rejeitar(o.e, 'cadastros_conflitantes'); continue }
    const { e, a, distParadaM } = lista.reduce((m, o) => (o.distParadaM < m.distParadaM ? o : m))
    const temNossa = coordValida(e.latAtual, e.lngAtual)
    sugestoes.push({
      endereco, nfs: lista.map(o => o.e.nf), placaNorm: e.placaNorm,
      latAtual: e.latAtual, lngAtual: e.lngAtual,
      distAtualM: temNossa ? haversine(e.latAtual as number, e.lngAtual as number, a.pontoLat as number, a.pontoLng as number) : null,
      fonteAtual: e.fonteAtual, latNova: a.pontoLat as number, lngNova: a.pontoLng as number, codigoUnitrac: a.codigoUnitrac, distParadaM,
    })
  }
  return { sugestoes, rejeicoes }
}
