// Correcao de geocode pela parada REAL (decisao 22/09): quando a Unitrac marca
// uma entrega como FEITA (situacao=1, feitoISO), a parada GPS da mesma placa
// cuja janela contem esse horario e' onde a entrega aconteceu de verdade.
// Usa a coordenada da PARADA (GPS), nunca o ponto cadastrado da Unitrac
// (pontoLat/pontoLng), que tem erro conhecido -- esse so' entra no relatorio
// de "cadastro divergente". Validado em 21/09: 14 de 15 correcoes feitas a mao
// reproduzidas a <100m.
import { haversine } from '@/lib/utils/geo'
import type { AlvoApi } from '@/lib/unitrac-api'
import type { ParadaBridge } from './base-horarios'
import { acessoSomentePorBarco } from './acesso-restrito'
import { RAIO_CONFIRMACAO_AMPLIADO_METROS } from './constants'

export const LIMITE_PARADA_ENTREGA_MIN = 120
export const LIMITE_CADASTRO_DIVERGENTE_M = 500
export const LIMITE_PARADAS_MESMO_ENDERECO_M = 300

export type EntregaParaCorrigir = { nf: string; placaNorm: string; endereco: string; latAtual: number | null; lngAtual: number | null; confiavelAtual: boolean }
export type SugestaoCorrecao = {
  endereco: string; nfs: string[]; placaNorm: string
  latAtual: number | null; lngAtual: number | null; distAtualM: number | null
  latNova: number; lngNova: number; duracaoParadaMin: number
  codigoUnitrac: string; cadastroLat: number | null; cadastroLng: number | null; distCadastroM: number | null
}
export type MotivoRejeicao = 'sem_alvo_feito' | 'feito_fora_de_parada' | 'parada_longa' | 'ilha' | 'coordenada_atual_ok' | 'paradas_conflitantes' | 'parada_compartilhada' | 'alvo_duplicado'
export type Rejeicao = { endereco: string; nf: string; placaNorm: string; motivo: MotivoRejeicao }

/** feitoISO da Unitrac: digitos ja em horario de Brasilia, as vezes com um Z
 *  mentiroso no fim. Converte pra instante real somando -03:00. */
export function instanteDeFeitoISO(feitoISO: string): number {
  const semFuso = feitoISO.replace(/(Z|[+-]\d\d:?\d\d)$/, '')
  return Date.parse(`${semFuso}-03:00`)
}

type Casamento = { entrega: EntregaParaCorrigir; alvo: AlvoApi; parada: ParadaBridge }

export function sugerirCorrecoesPorAlvo(
  entregas: EntregaParaCorrigir[],
  alvos: AlvoApi[],
  paradasPorPlaca: Map<string, ParadaBridge[]>,
): { sugestoes: SugestaoCorrecao[]; rejeicoes: Rejeicao[] } {
  const rejeicoes: Rejeicao[] = []
  const rejeitar = (e: EntregaParaCorrigir, motivo: MotivoRejeicao) =>
    rejeicoes.push({ endereco: e.endereco, nf: e.nf, placaNorm: e.placaNorm, motivo })

  // Agrupa alvos feitos por placa|documento. Se duas entregas diferentes (em
  // instantes diferentes) reivindicam a mesma chave, e' cadastro duplicado na
  // Unitrac -- nao da' pra saber qual e' o feito de verdade, entao a chave
  // toda fica invalida (em vez de "last wins").
  const gruposAlvo = new Map<string, AlvoApi[]>()
  for (const a of alvos) {
    if (a.situacao !== 1 || !a.feitoISO || !a.documento) continue
    const chave = `${a.placaNorm}|${a.documento}`
    const lista = gruposAlvo.get(chave) ?? []
    lista.push(a)
    gruposAlvo.set(chave, lista)
  }
  const alvoPorChave = new Map<string, AlvoApi>()
  const chavesDuplicadas = new Set<string>()
  for (const [chave, lista] of gruposAlvo) {
    const instantes = new Set(lista.map(a => instanteDeFeitoISO(a.feitoISO as string)))
    if (instantes.size > 1) { chavesDuplicadas.add(chave); continue }
    alvoPorChave.set(chave, lista[0])
  }

  const casamentosValidos: Casamento[] = []
  for (const e of entregas) {
    const chave = `${e.placaNorm}|${e.nf}`
    if (chavesDuplicadas.has(chave)) { rejeitar(e, 'alvo_duplicado'); continue }
    const a = alvoPorChave.get(chave)
    if (!a) { rejeitar(e, 'sem_alvo_feito'); continue }
    if (acessoSomentePorBarco(e.endereco)) { rejeitar(e, 'ilha'); continue }
    const t = instanteDeFeitoISO(a.feitoISO as string)
    const parada = (paradasPorPlaca.get(e.placaNorm) ?? []).find(p =>
      p.classificacao === 'FORA_BASE' && Date.parse(p.chegada) <= t && t <= Date.parse(p.saida))
    if (!parada) { rejeitar(e, 'feito_fora_de_parada'); continue }
    if (parada.duracaoSeg / 60 > LIMITE_PARADA_ENTREGA_MIN) { rejeitar(e, 'parada_longa'); continue }
    casamentosValidos.push({ entrega: e, alvo: a, parada })
  }

  // Uma parada pode responder por varios enderecos distintos quando o
  // motorista da baixa em lote no fim da entrega (mesmo GPS, clientes
  // diferentes). Nesse caso nao da' pra saber a coordenada real de nenhum
  // deles -- rejeita todo mundo que compartilhou a parada.
  const porParada = new Map<string, Casamento[]>()
  for (const c of casamentosValidos) {
    const chaveParada = `${c.entrega.placaNorm}|${c.parada.chegada}`
    const lista = porParada.get(chaveParada) ?? []
    lista.push(c)
    porParada.set(chaveParada, lista)
  }
  const compartilhados = new Set<Casamento>()
  for (const lista of porParada.values()) {
    const enderecos = new Set(lista.map(c => c.entrega.endereco))
    if (enderecos.size > 1) {
      for (const c of lista) { rejeitar(c.entrega, 'parada_compartilhada'); compartilhados.add(c) }
    }
  }

  const porEndereco = new Map<string, Casamento[]>()
  for (const c of casamentosValidos) {
    if (compartilhados.has(c)) continue
    const lista = porEndereco.get(c.entrega.endereco) ?? []
    lista.push(c)
    porEndereco.set(c.entrega.endereco, lista)
  }

  const maiorDistanciaParDaPar = (casamentos: Casamento[]): number => {
    let maior = 0
    for (let i = 0; i < casamentos.length; i++) {
      for (let j = i + 1; j < casamentos.length; j++) {
        const d = haversine(casamentos[i].parada.lat, casamentos[i].parada.lng, casamentos[j].parada.lat, casamentos[j].parada.lng)
        if (d > maior) maior = d
      }
    }
    return maior
  }

  const sugestoes: SugestaoCorrecao[] = []
  for (const [endereco, casamentos] of porEndereco) {
    const conflito = maiorDistanciaParDaPar(casamentos) > LIMITE_PARADAS_MESMO_ENDERECO_M
    if (conflito) { for (const c of casamentos) rejeitar(c.entrega, 'paradas_conflitantes'); continue }
    const { entrega: e, alvo: a, parada: p } = casamentos[0]
    const distAtualM = e.latAtual != null && e.lngAtual != null ? haversine(e.latAtual, e.lngAtual, p.lat, p.lng) : null
    if (e.confiavelAtual && distAtualM != null && distAtualM <= RAIO_CONFIRMACAO_AMPLIADO_METROS) {
      for (const c of casamentos) rejeitar(c.entrega, 'coordenada_atual_ok')
      continue
    }
    const cadastroLat = a.pontoLat ?? null
    const cadastroLng = a.pontoLng ?? null
    sugestoes.push({
      endereco, nfs: casamentos.map(c => c.entrega.nf), placaNorm: e.placaNorm,
      latAtual: e.latAtual, lngAtual: e.lngAtual, distAtualM,
      latNova: p.lat, lngNova: p.lng, duracaoParadaMin: Math.round(p.duracaoSeg / 60),
      codigoUnitrac: a.codigoUnitrac, cadastroLat, cadastroLng,
      distCadastroM: cadastroLat != null && cadastroLng != null ? haversine(cadastroLat, cadastroLng, p.lat, p.lng) : null,
    })
  }
  return { sugestoes, rejeicoes }
}
