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
// Filtros de 30/09 (verificacao manual das 89 sugestoes de 28-29/09: 19
// ERRADAS). Todos DESCARTAM a sugestao -- na duvida o cache fica como esta'.
/** (a) A placa tambem parou (FORA_BASE) a ate' isso da NOSSA coordenada atual:
 *  o GPS corrobora o que ja' temos e a parada que "confirma" o cadastro e' de
 *  outro cliente (#78: 9 min parado no endereco real). Nenhuma CORRETA de
 *  28-29/09 tinha parada a <=75 m da coordenada atual. */
export const RAIO_PARADA_NA_COORD_ATUAL_M = 75
/** (b) Coordenada atual (fonte confiavel) a ate' isso de um ponto CNEFE da
 *  mesma rua+numero = ja' esta' certa (#32/52/57/68/78: bate exato). */
export const RAIO_CNEFE_CONFIRMA_ATUAL_M = 100
/** (b) ...e so' descarta quando a sugestao se afasta mais que isso dela. */
export const LIMITE_SUGESTAO_LONGE_DO_CNEFE_M = 500
/** (a) A outra NF so' "e' dona" da parada se o cadastro dela estiver mais perto
 *  que o nosso por mais que isso -- abaixo e' empate no ruido do GPS (#72/#79). */
export const MARGEM_OUTRA_NF_MAIS_PERTO_M = 5
const TOLERANCIA_FEITO_MS = 10 * 60_000
const TOLERANCIA_FEITO_DUPLICADO_MS = 5 * 60_000

export type SugestaoCadastro = {
  endereco: string; nfs: string[]; placaNorm: string
  latAtual: number | null; lngAtual: number | null; distAtualM: number | null; fonteAtual: string | null
  latNova: number; lngNova: number; codigoUnitrac: string; distParadaM: number
}
export type MotivoRejeicaoCadastro = 'endereco_nao_identificado' | 'correcao_manual' | 'ilha' | 'sem_alvo_feito' | 'cadastro_invalido' | 'cadastro_nao_confirmado' | 'coordenada_atual_ok' | 'cadastros_conflitantes' | 'alvo_duplicado'
  | 'parada_de_outra_nf' | 'parada_na_coordenada_atual' | 'cadastro_compartilhado' | 'cnefe_confirma_atual'
export type RejeicaoCadastro = { endereco: string; nf: string; placaNorm: string; motivo: MotivoRejeicaoCadastro }

const coordValida = (lat: number | null | undefined, lng: number | null | undefined): lat is number =>
  typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)

export type PontoCnefe = { lat: number; lng: number }
export type OpcoesCadastro = {
  /** endereco do romaneio -> pontos CNEFE com a MESMA rua+numero (match exato,
   *  mesmo municipio). Ausente = filtro (b) nao roda. */
  cnefeRuaNumero?: Map<string, PontoCnefe[]>
}

function normalizarTexto(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}
const TIPOS_VIA = new Set(['AV', 'AVN', 'AVENIDA', 'AVENID', 'R', 'RUA', 'ROD', 'RODOVIA', 'EST', 'ESTRADA', 'TV', 'TRAVESSA', 'PC', 'PCA', 'PRACA', 'AL', 'ALAMEDA'])

/** "VIA, NUM - BAIRRO..." -> chave rua+numero normalizada; null sem numero
 *  (S/N nao identifica um imovel, entao nunca e' "mesmo local"). */
export function chaveRuaNumero(endereco: string): string | null {
  const i = endereco.indexOf(',')
  if (i < 0) return null
  const numero = endereco.slice(i + 1).split(' - ')[0].replace(/\D/g, '').replace(/^0+/, '')
  if (!numero) return null
  const palavras = normalizarTexto(endereco.slice(0, i)).split(' ')
  if (palavras.length > 1 && TIPOS_VIA.has(palavras[0])) palavras.shift()
  return `${palavras.join(' ')}|${numero}`
}

/** paradasPorPlaca na convencao MASCARADA (digitos BRT + Z falso), a mesma de
 *  sugerirCorrecoesPorAlvo/instanteDeFeitoISO. */
export function sugerirCadastroUnitrac(
  entregas: EntregaParaCorrigir[],
  alvos: AlvoApi[],
  paradasPorPlaca: Map<string, ParadaBridge[]>,
  opcoes: OpcoesCadastro = {},
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

  // Endereco de cada NF do romaneio e enderecos distintos por codigo Unitrac
  // (qualquer situacao: cadastro compartilhado nao depende de a outra NF ter sido feita).
  const enderecoDaNf = new Map<string, string>()
  for (const e of entregas) enderecoDaNf.set(`${e.placaNorm}|${e.nf}`, e.endereco)
  const enderecosPorCodigo = new Map<string, Set<string>>()
  for (const a of alvos) {
    const end = a.documento ? enderecoDaNf.get(`${a.placaNorm}|${a.documento}`) : undefined
    if (!end || end.trim() === ENDERECO_NAO_IDENTIFICADO) continue
    enderecosPorCodigo.set(a.codigoUnitrac, (enderecosPorCodigo.get(a.codigoUnitrac) ?? new Set()).add(end))
  }
  const alvosFeitosPorPlaca = new Map<string, AlvoApi[]>()
  for (const lista of alvoPorChave.values()) for (const a of lista) alvosFeitosPorPlaca.set(a.placaNorm, [...(alvosFeitosPorPlaca.get(a.placaNorm) ?? []), a])

  type Ok = { e: EntregaParaCorrigir; a: AlvoApi; distParadaM: number }
  const porEndereco = new Map<string, Ok[]>()
  for (const e of entregas) {
    if (e.endereco.trim() === ENDERECO_NAO_IDENTIFICADO) { rejeitar(e, 'endereco_nao_identificado'); continue }
    // Achado real 26/09 (correcoes finais pre-deploy, item 3): mesmo
    // tratamento de correcao-por-alvo.ts -- 'verificacao_manual' e' correcao
    // humana, nunca sobrescrita pelo upsert automatico.
    if (e.fonteAtual === 'manual' || e.fonteAtual === 'verificacao_manual') { rejeitar(e, 'correcao_manual'); continue }
    if (acessoSomentePorBarco(e.endereco)) { rejeitar(e, 'ilha'); continue }
    const alvosNf = alvoPorChave.get(`${e.placaNorm}|${e.nf}`)
    if (!alvosNf) { rejeitar(e, 'sem_alvo_feito'); continue }
    // Mesma NF com alvos feitos em instantes diferentes = cadastro duplicado na Unitrac
    // (mesmo tratamento de correcao-por-alvo): nao da' pra saber qual e' o feito real.
    const instantes = alvosNf.map(x => instanteDeFeitoISO(x.feitoISO as string))
    if (Math.max(...instantes) - Math.min(...instantes) > TOLERANCIA_FEITO_DUPLICADO_MS) { rejeitar(e, 'alvo_duplicado'); continue }
    const a = alvosNf[0]
    if (!coordValida(a.pontoLat, a.pontoLng)) { rejeitar(e, 'cadastro_invalido'); continue }
    const t = instanteDeFeitoISO(a.feitoISO as string)
    let melhor = Infinity
    let paradaMelhor: ParadaBridge | null = null
    for (const p of paradasPorPlaca.get(e.placaNorm) ?? []) {
      if (p.classificacao !== 'FORA_BASE') continue
      if (p.duracaoSeg / 60 > LIMITE_PARADA_ENTREGA_MIN) continue
      if (Date.parse(p.chegada) - TOLERANCIA_FEITO_MS > t || t > Date.parse(p.saida) + TOLERANCIA_FEITO_MS) continue
      const d = haversine(a.pontoLat, a.pontoLng as number, p.lat, p.lng)
      if (d < melhor) { melhor = d; paradaMelhor = p }
    }
    if (melhor > RAIO_CADASTRO_CONFIRMADO_M || !paradaMelhor) { rejeitar(e, 'cadastro_nao_confirmado'); continue }
    const temNossa = coordValida(e.latAtual, e.lngAtual)
    // "longe" e' medido ate' a PARADA que confirmou o cadastro (onde a entrega de fato aconteceu).
    const distAtual = temNossa ? haversine(e.latAtual as number, e.lngAtual as number, paradaMelhor.lat, paradaMelhor.lng) : null
    if (distAtual != null && distAtual <= LIMITE_NOSSA_COORD_LONGE_M) { rejeitar(e, 'coordenada_atual_ok'); continue }
    // (a/d) Um cadastro so' pra 2+ enderecos do romaneio (#26/27 Louise Vita, #57):
    // nao da' pra saber de qual endereco e' o ponto -- descarta todos.
    if ((enderecosPorCodigo.get(a.codigoUnitrac)?.size ?? 0) >= 2) { rejeitar(e, 'cadastro_compartilhado'); continue }
    // (a) A parada de prova ja' e' prova de OUTRA NF da placa (outro codigo, outro
    // local), cujo cadastro esta' mais perto dela que o nosso (#17,31,35,40,51,54,68,75).
    const pm = paradaMelhor
    const chaveNossa = chaveRuaNumero(e.endereco)
    const deOutraNf = (alvosFeitosPorPlaca.get(e.placaNorm) ?? []).some(o => {
      if (o.documento === e.nf || o.codigoUnitrac === a.codigoUnitrac || !coordValida(o.pontoLat, o.pontoLng)) return false
      const endOutro = enderecoDaNf.get(`${o.placaNorm}|${o.documento}`)
      if (endOutro === e.endereco) return false
      if (endOutro && chaveNossa != null && chaveRuaNumero(endOutro) === chaveNossa) return false
      const to = instanteDeFeitoISO(o.feitoISO as string)
      if (Date.parse(pm.chegada) - TOLERANCIA_FEITO_MS > to || to > Date.parse(pm.saida) + TOLERANCIA_FEITO_MS) return false
      const d = haversine(o.pontoLat, o.pontoLng as number, pm.lat, pm.lng)
      return d <= RAIO_CADASTRO_CONFIRMADO_M && d < melhor - MARGEM_OUTRA_NF_MAIS_PERTO_M
    })
    if (deOutraNf) { rejeitar(e, 'parada_de_outra_nf'); continue }
    // (a) A placa tambem parou na NOSSA coordenada (#78): ela ja' tem prova GPS.
    if (temNossa && (paradasPorPlaca.get(e.placaNorm) ?? []).some(p => p !== pm && p.classificacao === 'FORA_BASE' &&
      haversine(e.latAtual as number, e.lngAtual as number, p.lat, p.lng) <= RAIO_PARADA_NA_COORD_ATUAL_M)) { rejeitar(e, 'parada_na_coordenada_atual'); continue }
    // (b) Coordenada atual confiavel ja' bate rua+numero com o CNEFE e a sugestao
    // vai pra longe (#32,52,57,68,78) -- a nao ser que a sugestao TAMBEM bata com
    // um ponto CNEFE da mesma rua+numero (#80, condominio com varios pontos).
    const pontosCnefe = opcoes.cnefeRuaNumero?.get(e.endereco) ?? []
    if (temNossa && e.confiavelAtual && e.fonteAtual !== 'cnefe_bairro' && pontosCnefe.length > 0) {
      const perto = (lat: number, lng: number) => pontosCnefe.some(c => haversine(lat, lng, c.lat, c.lng) <= RAIO_CNEFE_CONFIRMA_ATUAL_M)
      const distSugestao = haversine(e.latAtual as number, e.lngAtual as number, a.pontoLat, a.pontoLng as number)
      if (perto(e.latAtual as number, e.lngAtual as number) && distSugestao > LIMITE_SUGESTAO_LONGE_DO_CNEFE_M && !perto(a.pontoLat, a.pontoLng as number)) {
        rejeitar(e, 'cnefe_confirma_atual'); continue
      }
    }
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
