// F4-07 (GEO-24, ACH-07, D-08): "Clientes que sempre falham" e "Corrigir
// ponto". Funções puras: juntam o resultado guardado de cada dia do Ao vivo
// com o código do cliente do romaneio, acham os clientes que falham pelo
// ponto em vários dias e montam as EVIDÊNCIAS que a operação pode usar para
// corrigir o ponto. Regra 1 do dono: ponto novo só sai de parada GPS real
// repetida (com a rua do CNEFE batendo), cadastro Unitrac confirmado por
// parada, ponto aprendido com 2+ confirmações ou correção do admin com
// evidência anexada. Nada aqui inventa coordenada: a tela escolhe uma
// evidência pelo id e o servidor recalcula tudo antes de gravar.
import { haversine } from '@/lib/utils/geo'
import { normPlaca } from '@/lib/unitrac-api/frota'
import { categoriaPendencia } from './resumo-dashboard'
import { chaveClienteLocal, type LocalCliente } from './locais-clientes'
import { chavePontoUnitrac, RAIO_CADASTRO_CONFIRMADO_M } from './cadastro-unitrac'

/** Só a Nutry: na Rio Quality o código do cliente é a NF/pedido (muda todo
 *  dia) até o F4-09, e o cadastro de locais só é lido na geração da Nutry. */
export const CLIENTE_PONTO = 'nutrimax' as const
/** Janela olhada (dias corridos até hoje). */
export const DIAS_JANELA = 31
/** "Sempre falha": falhou pelo ponto em pelo menos tantos dias da janela. */
export const MIN_DIAS_FALHA = 3

/** Motivos do KPI que apontam para o ponto do cliente (cadastro/coordenada). */
export const CATEGORIAS_PONTO: ReadonlySet<string> = new Set([
  'Coordenada imprecisa', 'Cadastro divergente', 'Endereço não localizado', 'Não foi ao cliente', 'Parada próxima', 'Passou perto sem parar',
])
const SITUACOES_FALHA: ReadonlySet<string> = new Set(['revisar', 'nao_foi', 'nao_confirmada'])

export type LinhaRomaneioDia = { nf: string; carga: string; clienteCodigo: string; clienteNome: string; endereco: string }
export type NfResultadoDia = { nf: string; carga: string; situacao: string; status: string; lat: number | null; lng: number | null }
export type PlacaResultadoDia = { placa: string; nfs: NfResultadoDia[] }

export type NfCliente = {
  data: string
  placa: string
  nf: string
  carga: string
  codigo: string
  nome: string
  endereco: string
  situacao: string
  status: string
  categoria: string | null
  lat: number | null
  lng: number | null
}

export const ehFalha = (n: { situacao: string }) => SITUACOES_FALHA.has(n.situacao)
export const ehFalhaDePonto = (n: { situacao: string; categoria: string | null }) => ehFalha(n) && n.categoria != null && CATEGORIAS_PONTO.has(n.categoria)

/** NFs do dia com o código do cliente (pão fica de fora: o "código" é a NF). */
export function nfsComCliente(data: string, romaneio: LinhaRomaneioDia[], placas: PlacaResultadoDia[]): NfCliente[] {
  const porNf = new Map<string, LinhaRomaneioDia>()
  for (const r of romaneio) porNf.set(`${r.carga}::${r.nf}`, r)
  const out: NfCliente[] = []
  for (const p of placas) {
    for (const n of p.nfs) {
      const r = porNf.get(`${n.carga}::${n.nf}`)
      if (!r) continue
      const codigo = chaveClienteLocal({ carga: r.carga, clienteCodigo: r.clienteCodigo })
      if (!codigo) continue
      out.push({
        data, placa: normPlaca(p.placa), nf: n.nf, carga: n.carga, codigo, nome: r.clienteNome, endereco: r.endereco,
        situacao: n.situacao, status: n.status, categoria: ehFalha(n) ? categoriaPendencia(n.status) : null,
        lat: n.lat ?? null, lng: n.lng ?? null,
      })
    }
  }
  return out
}

export type ClienteQueFalha = {
  codigo: string
  nome: string
  endereco: string
  /** Dias da janela com NF do cliente. */
  dias: number
  diasFalha: number
  /** Dias em que falhou por um motivo de ponto/cadastro (CATEGORIAS_PONTO). */
  diasFalhaPonto: number
  motivos: { motivo: string; dias: number }[]
  ultimaFalha: string
  ultimoStatus: string
}

/** Clientes que falham pelo ponto em `minDias` dias ou mais, do pior pro melhor. */
export function clientesQueFalham(nfs: NfCliente[], minDias = MIN_DIAS_FALHA): ClienteQueFalha[] {
  const porCliente = new Map<string, NfCliente[]>()
  for (const n of nfs) porCliente.set(n.codigo, [...(porCliente.get(n.codigo) ?? []), n])
  const out: ClienteQueFalha[] = []
  for (const [codigo, lista] of porCliente) {
    const diasDe = (f: (n: NfCliente) => boolean) => new Set(lista.filter(f).map(n => n.data))
    const diasPonto = diasDe(ehFalhaDePonto)
    if (diasPonto.size < minDias) continue
    const motivos = new Map<string, Set<string>>()
    for (const n of lista) if (ehFalha(n) && n.categoria) motivos.set(n.categoria, (motivos.get(n.categoria) ?? new Set()).add(n.data))
    const falhas = lista.filter(ehFalha).sort((a, b) => b.data.localeCompare(a.data))
    const recente = [...lista].sort((a, b) => b.data.localeCompare(a.data))[0]
    out.push({
      codigo, nome: recente.nome, endereco: recente.endereco,
      dias: diasDe(() => true).size, diasFalha: diasDe(ehFalha).size, diasFalhaPonto: diasPonto.size,
      motivos: [...motivos].map(([motivo, d]) => ({ motivo, dias: d.size })).sort((a, b) => b.dias - a.dias || a.motivo.localeCompare(b.motivo)),
      ultimaFalha: falhas[0].data, ultimoStatus: falhas[0].status,
    })
  }
  return out.sort((a, b) => b.diasFalhaPonto - a.diasFalhaPonto || b.diasFalha - a.diasFalha || a.nome.localeCompare(b.nome))
}

// ---------------------------------------------------------------------------
// Evidências para corrigir o ponto

export type ParadaSnapshot = {
  lat: number | null
  lng: number | null
  chegada: string
  saida?: string | null
  fim_real?: string | null
  duracao_seg?: number | null
  classificacao?: string | null
}
export type NfDaPlaca = { nf: string; situacao: string; lat: number | null; lng: number | null }
export type AlvoSnapshot = { documento?: string | null; codigoUnitrac?: string | null; placaNorm?: string | null; pontoLat?: number | null; pontoLng?: number | null }

/** Parada que conta como evidência: fora da base, >= 3 min (a mesma régua da
 *  parada própria do F1-07). */
export const PARADA_MIN_S = 180
/** Paradas a até isso uma da outra são o mesmo lugar (dias diferentes). */
export const RAIO_AGRUPAR_M = 100
/** Parada a até isso de OUTRA NF entregue da mesma placa no dia é daquele
 *  cliente, não serve de evidência deste (regra A, 24/10). */
export const RAIO_OUTRA_ENTREGA_M = 150
/** "Parada GPS real repetida": em pelo menos 2 dias diferentes. */
export const MIN_DIAS_PARADA = 2
/** A rua do endereço no CNEFE tem que passar a até isso da parada. */
export const RAIO_RUA_CNEFE_M = 150
const MAX_CANDIDATAS = 10

const dist = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => haversine(a.lat, a.lng, b.lat, b.lng)
const temCoord = <T extends { lat: number | null; lng: number | null }>(x: T): x is T & { lat: number; lng: number } =>
  typeof x.lat === 'number' && typeof x.lng === 'number' && Number.isFinite(x.lat) && Number.isFinite(x.lng) && !(x.lat === 0 && x.lng === 0)

function duracaoS(p: ParadaSnapshot): number {
  if (typeof p.duracao_seg === 'number') return p.duracao_seg
  const fim = p.fim_real ?? p.saida ?? p.chegada
  return (Date.parse(fim) - Date.parse(p.chegada)) / 1000
}
function mediana(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export const chavePlacaDia = (data: string, placa: string) => `${data}|${normPlaca(placa)}`

type ParadaUtil = { data: string; lat: number; lng: number; durS: number }

/** Paradas da placa que levou o cliente, nos dias dele, que podem ser deste
 *  cliente: fora da base, >= 3 min e longe das outras entregas feitas. */
function paradasUteis(nfsCliente: NfCliente[], paradas: Map<string, ParadaSnapshot[]>, nfsDaPlaca: Map<string, NfDaPlaca[]>): ParadaUtil[] {
  const out: ParadaUtil[] = []
  const vistos = new Set<string>()
  for (const n of nfsCliente) {
    const k = chavePlacaDia(n.data, n.placa)
    if (vistos.has(k)) continue
    vistos.add(k)
    const doCliente = new Set(nfsCliente.filter(x => chavePlacaDia(x.data, x.placa) === k).map(x => x.nf))
    const outrasEntregues = (nfsDaPlaca.get(k) ?? []).filter(x => !doCliente.has(x.nf) && x.situacao === 'entregue').filter(temCoord)
    for (const p of paradas.get(k) ?? []) {
      if (p.classificacao !== 'FORA_BASE' || !temCoord(p)) continue
      const durS = duracaoS(p)
      if (!(durS >= PARADA_MIN_S)) continue
      if (outrasEntregues.some(o => dist(o, p) <= RAIO_OUTRA_ENTREGA_M)) continue
      out.push({ data: n.data, lat: p.lat, lng: p.lng, durS })
    }
  }
  return out
}

export type CandidataParada = {
  id: string
  lat: number
  lng: number
  dias: string[]
  paradas: number
  minutosMediana: number
  distPontoAtualM: number | null
  /** Preenchido pelo servidor (ponte do CNEFE): a rua do endereço passa a até
   *  RAIO_RUA_CNEFE_M da parada. null = não conferido. */
  ruaConfere?: boolean | null
  ruaDistM?: number | null
  /** Preenchido pelo servidor (guarda territorial do monitoramento: município
   *  pelo polígono IBGE + bairro a até 1 km do hull do CNEFE). null = não
   *  conferido. Rodovia/estrada longa "bate" de rua em qualquer ponto dela. */
  territorio?: Territorio
}
export type Territorio = 'ok' | 'municipio_divergente' | 'bairro_divergente' | null

/** Lugares onde a placa do cliente parou em 2+ dias diferentes (paradas a até
 *  100 m uma da outra), mais repetidos primeiro. */
export function candidatasParada(p: {
  nfsCliente: NfCliente[]
  paradas: Map<string, ParadaSnapshot[]>
  nfsDaPlaca: Map<string, NfDaPlaca[]>
  pontoAtual: { lat: number; lng: number } | null
}): CandidataParada[] {
  let restantes = paradasUteis(p.nfsCliente, p.paradas, p.nfsDaPlaca)
  const out: CandidataParada[] = []
  while (restantes.length) {
    // Semente: a parada com vizinhas (<= 100 m) no maior número de dias.
    let melhor: { viz: ParadaUtil[]; dias: number } | null = null
    for (const s of restantes) {
      const viz = restantes.filter(x => dist(s, x) <= RAIO_AGRUPAR_M)
      const dias = new Set(viz.map(x => x.data)).size
      if (!melhor || dias > melhor.dias || (dias === melhor.dias && viz.length > melhor.viz.length)) melhor = { viz, dias }
    }
    if (!melhor || melhor.dias < MIN_DIAS_PARADA) break
    const grupo = new Set(melhor.viz)
    restantes = restantes.filter(x => !grupo.has(x))
    const lat = Number(mediana(melhor.viz.map(x => x.lat)).toFixed(6)), lng = Number(mediana(melhor.viz.map(x => x.lng)).toFixed(6))
    out.push({
      id: `parada:${lat.toFixed(5)},${lng.toFixed(5)}`, lat, lng,
      dias: [...new Set(melhor.viz.map(x => x.data))].sort(), paradas: melhor.viz.length,
      minutosMediana: Math.round(mediana(melhor.viz.map(x => x.durS)) / 60),
      distPontoAtualM: p.pontoAtual ? Math.round(dist(p.pontoAtual, { lat, lng })) : null,
    })
  }
  return out.sort((a, b) => b.dias.length - a.dias.length || (a.distPontoAtualM ?? Infinity) - (b.distPontoAtualM ?? Infinity)).slice(0, MAX_CANDIDATAS)
}

export type CandidatoCadastro = {
  id: string
  lat: number
  lng: number
  /** Dias em que o cadastro estava no alvo da Unitrac. */
  dias: string[]
  /** Dias em que a placa do cliente parou (>= 3 min, fora da base, longe de
   *  outra entrega feita) a até 300 m do cadastro. */
  diasConfirmados: string[]
  distParadaM: number | null
  /** O mesmo ponto cadastrado para OUTRO cliente (cadastro genérico, regra B). */
  generico: boolean
  distPontoAtualM: number | null
  /** Ver CandidataParada.territorio. */
  territorio?: Territorio
}

/** Pontos do cadastro do cliente na Unitrac (alvos guardados de cada dia) e
 *  quantos dias uma parada da placa confirmou cada um. */
export function candidatosCadastro(p: {
  codigo: string
  nfsCliente: NfCliente[]
  alvosPorDia: Map<string, AlvoSnapshot[]>
  paradas: Map<string, ParadaSnapshot[]>
  nfsDaPlaca: Map<string, NfDaPlaca[]>
  pontoAtual: { lat: number; lng: number } | null
}): CandidatoCadastro[] {
  const porChave = new Map<string, CandidatoCadastro>()
  const dias = [...new Set(p.nfsCliente.map(n => n.data))].sort()
  for (const data of dias) {
    const alvos = p.alvosPorDia.get(data) ?? []
    const meus = alvos.filter(a => String(a.codigoUnitrac ?? '') === p.codigo && typeof a.pontoLat === 'number' && typeof a.pontoLng === 'number' && !(a.pontoLat === 0 && a.pontoLng === 0))
    const doDia = p.nfsCliente.filter(n => n.data === data)
    const uteis = paradasUteis(doDia, p.paradas, p.nfsDaPlaca)
    for (const a of meus) {
      const lat = a.pontoLat as number, lng = a.pontoLng as number
      const chave = chavePontoUnitrac(lat, lng)
      const c = porChave.get(chave) ?? {
        id: `cadastro:${chave}`, lat, lng, dias: [], diasConfirmados: [], distParadaM: null, generico: false,
        distPontoAtualM: p.pontoAtual ? Math.round(dist(p.pontoAtual, { lat, lng })) : null,
      }
      if (!c.dias.includes(data)) c.dias.push(data)
      if (alvos.some(o => String(o.codigoUnitrac ?? '') !== p.codigo && typeof o.pontoLat === 'number' && typeof o.pontoLng === 'number' && chavePontoUnitrac(o.pontoLat, o.pontoLng) === chave)) c.generico = true
      const perto = uteis.map(u => dist(u, { lat, lng })).filter(d => d <= RAIO_CADASTRO_CONFIRMADO_M)
      if (perto.length) {
        if (!c.diasConfirmados.includes(data)) c.diasConfirmados.push(data)
        const m = Math.round(Math.min(...perto))
        c.distParadaM = c.distParadaM == null ? m : Math.min(c.distParadaM, m)
      }
      porChave.set(chave, c)
    }
  }
  return [...porChave.values()].sort((a, b) => b.diasConfirmados.length - a.diasConfirmados.length || b.dias.length - a.dias.length)
}

/** Rua do endereço do romaneio ("RUA X, 10 - BAIRRO..." -> "RUA X"). */
export function ruaDoEndereco(endereco: string): string {
  const e = endereco.trim()
  const i = e.indexOf(',')
  return (i >= 0 ? e.slice(0, i) : e.split(' - ')[0]).trim()
}

// ---------------------------------------------------------------------------
// Decisão da correção

export const ACOES_PONTO = ['parada', 'cadastro_unitrac', 'aprendido', 'pino'] as const
export type AcaoPonto = (typeof ACOES_PONTO)[number]
export const acaoPontoValida = (a: string): a is AcaoPonto => (ACOES_PONTO as readonly string[]).includes(a)

export const ROTULO_ACAO_PONTO: Record<AcaoPonto, string> = {
  parada: 'Usar a parada repetida',
  cadastro_unitrac: 'Usar o cadastro da Unitrac',
  aprendido: 'Confirmar o ponto aprendido',
  pino: 'Ponto marcado no mapa pelo admin',
}

// Mesma faixa de scripts/aplicar-correcoes-geocode.ts (coordenadaValidaRj):
// pega erro grosso de mão (outro estado, lat/lng trocados), não é polígono.
export function coordenadaNoRj(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -23.5 && lat <= -20.7 && lng >= -45.0 && lng <= -40.9
}

export type PainelPonto = {
  codigo: string
  nome: string
  endereco: string
  pontoAtual: { lat: number; lng: number; data: string } | null
  local: LocalCliente | null
  paradas: CandidataParada[]
  cadastros: CandidatoCadastro[]
}
export type PedidoPonto = { acao: AcaoPonto; id?: string | null; lat?: number | null; lng?: number | null; observacao?: string | null }
export type Decisao =
  | { ok: true; lat: number; lng: number; raioM: number | null; confirmacoes: number; evidencia: Record<string, unknown>; resumo: string }
  | { ok: false; status: number; erro: string }

const MSG_TERRITORIO = (t: Territorio | undefined) => t === 'municipio_divergente' ? 'Esse ponto fica fora do município do endereço do romaneio.'
  : t === 'bairro_divergente' ? 'Esse ponto fica fora do bairro do endereço do romaneio (mais de 1 km).'
    : 'Não consegui conferir o município/bairro desse ponto agora. Tente de novo.'

export function decidirCorrecao(painel: PainelPonto, pedido: PedidoPonto, quem: { admin: boolean; temAnexo: boolean }): Decisao {
  const nao = (status: number, erro: string): Decisao => ({ ok: false, status, erro })
  // Fonte protegida: correção manual anterior só sai pelo "Desfazer" (ou pelo admin).
  if (painel.local?.fonte === 'manual' && !quem.admin) return nao(409, 'Este cliente já tem ponto corrigido à mão. Desfaça a correção anterior antes de gravar outra.')
  let r: Extract<Decisao, { ok: true }>
  switch (pedido.acao) {
    case 'parada': {
      const c = painel.paradas.find(x => x.id === pedido.id)
      if (!c) return nao(404, 'Essa parada não está mais entre as evidências deste cliente. Recarregue a tela.')
      if (c.dias.length < MIN_DIAS_PARADA) return nao(422, 'A parada precisa se repetir em pelo menos 2 dias.')
      if (c.ruaConfere !== true) return nao(422, 'A rua do endereço não passa por essa parada no CNEFE (ou a conferência está indisponível). Use outra evidência.')
      if (c.territorio !== 'ok') return nao(422, MSG_TERRITORIO(c.territorio))
      r = { ok: true, lat: c.lat, lng: c.lng, raioM: null, confirmacoes: c.dias.length, evidencia: { tipo: 'parada', dias: c.dias, paradas: c.paradas, minutosMediana: c.minutosMediana, ruaDistM: c.ruaDistM ?? null, territorio: c.territorio }, resumo: `parada da placa repetida em ${c.dias.length} dias (${c.dias.join(', ')}), rua do CNEFE a ${c.ruaDistM ?? '?'} m` }
      break
    }
    case 'cadastro_unitrac': {
      const c = painel.cadastros.find(x => x.id === pedido.id)
      if (!c) return nao(404, 'Esse cadastro não está mais entre as evidências deste cliente. Recarregue a tela.')
      if (c.generico) return nao(422, 'Esse ponto da Unitrac é o mesmo de outro cliente (cadastro genérico): não identifica este cliente.')
      if (c.diasConfirmados.length < 1) return nao(422, 'Nenhuma parada da placa confirmou esse cadastro (até 300 m). Sem a parada, o cadastro não vale.')
      if (c.territorio !== 'ok') return nao(422, MSG_TERRITORIO(c.territorio))
      r = { ok: true, lat: c.lat, lng: c.lng, raioM: null, confirmacoes: c.diasConfirmados.length, evidencia: { tipo: 'cadastro_unitrac', diasConfirmados: c.diasConfirmados, distParadaM: c.distParadaM, territorio: c.territorio }, resumo: `cadastro Unitrac confirmado por parada em ${c.diasConfirmados.length} dia(s) (${c.diasConfirmados.join(', ')}), parada a ${c.distParadaM} m` }
      break
    }
    case 'aprendido': {
      const l = painel.local
      if (!l || l.fonte === 'manual') return nao(404, 'Este cliente não tem ponto aprendido para confirmar.')
      if (l.confirmacoes < 2) return nao(422, 'O ponto aprendido tem só 1 confirmação. Precisa de 2 dias que concordem.')
      r = { ok: true, lat: l.lat, lng: l.lng, raioM: l.raioM, confirmacoes: l.confirmacoes, evidencia: { tipo: 'aprendido', fonte: l.fonte, confirmacoes: l.confirmacoes }, resumo: `ponto aprendido (${l.fonte === 'entrega_confirmada' ? 'entregas confirmadas' : 'paradas'}) com ${l.confirmacoes} confirmações` }
      break
    }
    case 'pino': {
      if (!quem.admin) return nao(403, 'Só o admin marca o ponto no mapa.')
      if (!quem.temAnexo) return nao(400, 'Anexe a evidência (foto, canhoto ou print do cadastro) para marcar o ponto no mapa.')
      if (!(pedido.observacao ?? '').trim()) return nao(400, 'Escreva de onde veio o ponto (o que a evidência mostra).')
      const lat = Number(pedido.lat), lng = Number(pedido.lng)
      if (pedido.lat == null || pedido.lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return nao(400, 'Marque o ponto no mapa.')
      r = { ok: true, lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), raioM: null, confirmacoes: 1, evidencia: { tipo: 'pino' }, resumo: 'ponto marcado no mapa pelo admin, com evidência anexada' }
      break
    }
  }
  if (!coordenadaNoRj(r.lat, r.lng)) return nao(422, 'O ponto ficou fora do estado do RJ. Confira a evidência.')
  return r
}

/** Caminho da evidência no bucket do KPI (o mesmo da fila Conferir, F3-03). */
export function caminhoEvidenciaPonto(cliente: string, codigo: string, extensao: string, agoraMs: number, sufixo: string): string {
  const cod = codigo.replace(/[^0-9A-Za-z_-]/g, '_').slice(0, 40) || 'cliente'
  return `comprovantes/${cliente}/ponto-cliente/${cod}-${agoraMs}-${sufixo}.${extensao}`
}
