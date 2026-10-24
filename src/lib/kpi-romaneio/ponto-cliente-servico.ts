// F4-07 (GEO-24, ACH-07, D-08): lado servidor de "Clientes que sempre falham"
// e "Corrigir ponto". Lê o que o Ao vivo guardou de cada dia (romaneio com o
// código do cliente + resultado do cálculo), as paradas e os alvos guardados
// à noite e o cadastro de locais. Só leitura, menos o repositório da correção
// (ponto-cliente-correcao.ts), que grava kpi_cliente_local com trilha.
import { createServiceClient } from '@/lib/supabase/service'
import { normPlaca } from '@/lib/unitrac-api/frota'
import { haversine } from '@/lib/utils/geo'
import { buscarLocaisClientes, type LocalCliente } from './locais-clientes'
import { reposicionarPorAncoras } from './geocode-ancoras'
import { reprovadosNaGuarda } from './geocode'
import { chaveCacheEndereco } from './endereco-cep'
import {
  CLIENTE_PONTO, DIAS_JANELA, RAIO_RUA_CNEFE_M, nfsComCliente, clientesQueFalham, candidatasParada, candidatosCadastro, ruaDoEndereco, chavePlacaDia, ehFalha,
  type NfCliente, type LinhaRomaneioDia, type PlacaResultadoDia, type ParadaSnapshot, type NfDaPlaca, type AlvoSnapshot, type PainelPonto, type ClienteQueFalha,
} from './ponto-cliente'
import { TrilhaIndisponivel, type RepoPonto, type LinhaLocal, type CorrecaoPonto, type NovaCorrecao } from './ponto-cliente-correcao'

const TABELA_TRILHA = 'kpi_cliente_local_correcao'
const TTL_MS = 5 * 60_000

/** PostgREST: tabela fora do schema cache (migration não aplicada). */
export function tabelaAusente(e: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!e) return false
  return e.code === 'PGRST205' || e.code === '42P01' || /could not find the table|does not exist/i.test(e.message ?? '')
}

function diaMenos(data: string, n: number): string {
  const d = new Date(`${data}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

type Janela = { dias: string[]; nfs: NfCliente[]; nfsDaPlaca: Map<string, NfDaPlaca[]> }
let cache: { chave: string; em: number; janela: Janela } | null = null

/** NFs com código do cliente dos últimos DIAS_JANELA dias guardados no Ao vivo. */
export async function carregarJanela(hoje: string, forcar = false): Promise<Janela> {
  if (!forcar && cache && cache.chave === hoje && Date.now() - cache.em < TTL_MS) return cache.janela
  const svc = createServiceClient()
  const desde = diaMenos(hoje, DIAS_JANELA)
  const [{ data: entradas, error: e1 }, { data: calculos, error: e2 }] = await Promise.all([
    svc.from('kpi_ao_vivo_dia').select('data, romaneio').eq('cliente', CLIENTE_PONTO).gte('data', desde).lte('data', hoje),
    svc.from('kpi_ao_vivo_calculo').select('data, resultado').eq('cliente', CLIENTE_PONTO).gte('data', desde).lte('data', hoje),
  ])
  if (e1 || e2) throw new Error(`leitura dos dias do Ao vivo: ${(e1 ?? e2)!.message}`)
  const romaneioPorDia = new Map((entradas ?? []).map(r => [String(r.data), (r.romaneio as LinhaRomaneioDia[] | null) ?? []]))
  const nfs: NfCliente[] = []
  const nfsDaPlaca = new Map<string, NfDaPlaca[]>()
  const dias: string[] = []
  for (const c of calculos ?? []) {
    const data = String(c.data)
    const placas = ((c.resultado as { placas?: PlacaResultadoDia[] } | null)?.placas ?? [])
    const romaneio = romaneioPorDia.get(data)
    if (!romaneio || !placas.length) continue
    dias.push(data)
    nfs.push(...nfsComCliente(data, romaneio, placas))
    for (const p of placas) nfsDaPlaca.set(chavePlacaDia(data, p.placa), p.nfs.map(n => ({ nf: n.nf, situacao: n.situacao, lat: n.lat ?? null, lng: n.lng ?? null })))
  }
  const janela = { dias: dias.sort(), nfs, nfsDaPlaca }
  cache = { chave: hoje, em: Date.now(), janela }
  return janela
}

export async function listarClientesQueFalham(hoje: string): Promise<{ dias: string[]; clientes: (ClienteQueFalha & { local: LocalCliente | null })[] }> {
  const j = await carregarJanela(hoje)
  const locais = await buscarLocaisClientes(CLIENTE_PONTO)
  return { dias: j.dias, clientes: clientesQueFalham(j.nfs).map(c => ({ ...c, local: locais.get(c.codigo) ?? null })) }
}

export type NfDoPainel = Pick<NfCliente, 'data' | 'placa' | 'nf' | 'situacao' | 'status' | 'categoria' | 'lat' | 'lng' | 'endereco'> & { falha: boolean }
export type PainelCompleto = PainelPonto & { nfs: NfDoPainel[]; correcoes: CorrecaoTela[]; correcaoLiberada: boolean; ruaConferida: boolean }
export type CorrecaoTela = Pick<CorrecaoPonto, 'id' | 'acao' | 'lat' | 'lng' | 'observacao' | 'responsavel' | 'criado_em' | 'desfeita_em' | 'desfeita_por' | 'evidencia'> & { temAnexo: boolean; anteriorFonte: string | null }

/** Painel de um cliente: as NFs da janela, o ponto de hoje, o local guardado e
 *  as evidências (paradas repetidas com a rua do CNEFE conferida pela ponte do
 *  monitoramento, cadastro Unitrac confirmado por parada, ponto aprendido). */
export async function montarPainel(hoje: string, codigo: string, opcoes: { conferirRua?: boolean; forcar?: boolean } = {}): Promise<PainelCompleto | null> {
  const j = await carregarJanela(hoje, opcoes.forcar)
  const nfsCliente = j.nfs.filter(n => n.codigo === codigo)
  if (!nfsCliente.length) return null
  const svc = createServiceClient()
  const dias = [...new Set(nfsCliente.map(n => n.data))].sort()
  const placas = [...new Set(nfsCliente.map(n => normPlaca(n.placa)))]
  const [{ data: snaps, error: e1 }, { data: alvosRows, error: e2 }, locais] = await Promise.all([
    svc.from('kpi_paradas_snapshot').select('data, placa, paradas').eq('empresa', CLIENTE_PONTO).in('data', dias).in('placa', placas),
    svc.from('kpi_alvos_snapshot').select('data_referencia, alvos').eq('cliente', CLIENTE_PONTO).in('data_referencia', dias),
    buscarLocaisClientes(CLIENTE_PONTO),
  ])
  if (e1) throw new Error(`leitura das paradas guardadas: ${e1.message}`)
  if (e2) throw new Error(`leitura dos alvos guardados: ${e2.message}`)
  const paradas = new Map<string, ParadaSnapshot[]>()
  const pares = new Set(nfsCliente.map(n => chavePlacaDia(n.data, n.placa)))
  for (const s of snaps ?? []) {
    const k = chavePlacaDia(String(s.data), String(s.placa))
    if (pares.has(k)) paradas.set(k, (s.paradas as ParadaSnapshot[] | null) ?? [])
  }
  const alvosPorDia = new Map<string, AlvoSnapshot[]>()
  for (const a of alvosRows ?? []) {
    const lista = (a.alvos as AlvoSnapshot[] | null) ?? []
    // Só o que a evidência precisa: os alvos do cliente e os que repetem o ponto deles (regra B).
    const meus = lista.filter(x => String(x.codigoUnitrac ?? '') === codigo)
    const chaves = new Set(meus.map(x => `${x.pontoLat},${x.pontoLng}`))
    alvosPorDia.set(String(a.data_referencia), lista.filter(x => chaves.has(`${x.pontoLat},${x.pontoLng}`)))
  }
  const recente = [...nfsCliente].sort((a, b) => b.data.localeCompare(a.data))
  const comPonto = recente.find(n => n.lat != null && n.lng != null)
  const pontoAtual = comPonto ? { lat: comPonto.lat as number, lng: comPonto.lng as number, data: comPonto.data } : null
  const candidatas = candidatasParada({ nfsCliente, paradas, nfsDaPlaca: j.nfsDaPlaca, pontoAtual })
  const endereco = recente[0].endereco
  let ruaConferida = false
  if (opcoes.conferirRua !== false && candidatas.length) {
    const rua = ruaDoEndereco(endereco)
    const r = await reposicionarPorAncoras(candidatas.map(c => ({ id: c.id, ruas: [rua], ancoras: [{ lat: c.lat, lng: c.lng }] })))
    // Ponte fora: todos voltam null -> "não conferido" (a ação é recusada).
    ruaConferida = [...r.values()].some(v => v[0] != null)
    for (const c of candidatas) {
      const p = r.get(c.id)?.[0] ?? null
      const d = p ? Math.round(haversine(p.lat, p.lng, c.lat, c.lng)) : null
      c.ruaDistM = d
      c.ruaConfere = d != null ? d <= RAIO_RUA_CNEFE_M : (ruaConferida ? false : null)
    }
    candidatas.sort((a, b) => Number(b.ruaConfere === true) - Number(a.ruaConfere === true))
  }
  const cadastros = candidatosCadastro({ codigo, nfsCliente, alvosPorDia, paradas, nfsDaPlaca: j.nfsDaPlaca, pontoAtual })
  // Guarda territorial (a mesma do geocode): a evidência tem que cair no
  // município/bairro do endereço. Ponte fora = não conferido (a ação é recusada).
  if (opcoes.conferirRua !== false && (candidatas.length || cadastros.length)) {
    const pontos = [...candidatas, ...cadastros].map(c => ({ id: c.id, lat: c.lat, lng: c.lng, endereco: chaveCacheEndereco(endereco) }))
    const reprovados = await reprovadosNaGuarda(pontos)
    for (const c of [...candidatas, ...cadastros]) c.territorio = reprovados ? (reprovados.get(c.id) ?? 'ok') : null
  }
  const { correcoes, liberada } = await listarCorrecoes(codigo)
  return {
    codigo, nome: recente[0].nome, endereco, pontoAtual,
    local: locais.get(codigo) ?? null,
    paradas: candidatas,
    cadastros,
    nfs: recente.map(n => ({ data: n.data, placa: n.placa, nf: n.nf, situacao: n.situacao, status: n.status, categoria: n.categoria, lat: n.lat, lng: n.lng, endereco: n.endereco, falha: ehFalha(n) })),
    correcoes, correcaoLiberada: liberada, ruaConferida,
  }
}

const paraTela = (c: CorrecaoPonto): CorrecaoTela => ({
  id: c.id, acao: c.acao, lat: c.lat, lng: c.lng, observacao: c.observacao, responsavel: c.responsavel, criado_em: c.criado_em,
  desfeita_em: c.desfeita_em, desfeita_por: c.desfeita_por, evidencia: c.evidencia, temAnexo: !!c.documento, anteriorFonte: c.anterior?.fonte ?? null,
})

/** Trilha do cliente, mais recente primeiro. Sem a tabela: correção desligada. */
export async function listarCorrecoes(codigo: string): Promise<{ correcoes: CorrecaoTela[]; liberada: boolean }> {
  const { data, error } = await createServiceClient().from(TABELA_TRILHA).select('*')
    .eq('empresa', CLIENTE_PONTO).eq('cliente_codigo', codigo).order('criado_em', { ascending: false }).limit(20)
  if (error) {
    if (tabelaAusente(error)) return { correcoes: [], liberada: false }
    throw new Error(`leitura da trilha de correções: ${error.message}`)
  }
  return { correcoes: ((data ?? []) as CorrecaoPonto[]).map(paraTela), liberada: true }
}

export async function documentoDaCorrecao(codigo: string, id: number): Promise<string | null> {
  const { data, error } = await createServiceClient().from(TABELA_TRILHA).select('documento')
    .eq('empresa', CLIENTE_PONTO).eq('cliente_codigo', codigo).eq('id', id).maybeSingle()
  if (error || !data) return null
  return (data.documento as string | null) ?? null
}

/** Repositório de produção da correção (kpi_cliente_local + trilha). */
export function repoSupabase(): RepoPonto {
  const svc = createServiceClient()
  return {
    async lerLocal(codigo) {
      const { data, error } = await svc.from('kpi_cliente_local').select('*').eq('empresa', CLIENTE_PONTO).eq('cliente_codigo', codigo).maybeSingle()
      if (error) throw new Error(`leitura do local do cliente: ${error.message}`)
      return (data as LinhaLocal | null) ?? null
    },
    async gravarLocal(linha) {
      const { error } = await svc.from('kpi_cliente_local').upsert(linha, { onConflict: 'empresa,cliente_codigo' })
      if (error) throw new Error(`gravação do local do cliente: ${error.message}`)
    },
    async apagarLocal(codigo) {
      const { error } = await svc.from('kpi_cliente_local').delete().eq('empresa', CLIENTE_PONTO).eq('cliente_codigo', codigo)
      if (error) throw new Error(`remoção do local do cliente: ${error.message}`)
    },
    async inserirCorrecao(c: NovaCorrecao) {
      const { data, error } = await svc.from(TABELA_TRILHA).insert(c).select('*').single()
      if (error) {
        if (tabelaAusente(error)) throw new TrilhaIndisponivel()
        throw new Error(`gravação da trilha: ${error.message}`)
      }
      return data as CorrecaoPonto
    },
    async lerCorrecao(id) {
      const { data, error } = await svc.from(TABELA_TRILHA).select('*').eq('empresa', CLIENTE_PONTO).eq('id', id).maybeSingle()
      if (error) {
        if (tabelaAusente(error)) throw new TrilhaIndisponivel()
        throw new Error(`leitura da trilha: ${error.message}`)
      }
      return (data as CorrecaoPonto | null) ?? null
    },
    async marcarDesfeita(id, por) {
      const { error } = await svc.from(TABELA_TRILHA).update({ desfeita_em: new Date().toISOString(), desfeita_por: por }).eq('id', id).is('desfeita_em', null)
      if (error) throw new Error(`trilha (desfazer): ${error.message}`)
    },
  }
}

/** Depois de gravar/desfazer: a próxima leitura relê os dias. */
export function esquecerJanela(): void { cache = null }
