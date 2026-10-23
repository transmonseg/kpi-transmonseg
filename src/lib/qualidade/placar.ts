// F1-01 (plano mestre 23/10): placar de qualidade diario, so' leitura.
// Funcoes puras que transformam o que o script le do banco/log em linhas
// (dia, cliente, metrica, valor, detalhe) -- o mesmo formato da futura tabela
// qualidade_diaria, para importar os JSON ja' gravados sem conversao.
// Nada aqui muda numero do cliente: o placar so' mede.
import { categoriaPendencia } from '@/lib/kpi-romaneio/resumo-dashboard'

export type LinhaPlacar = {
  dia: string
  cliente: string // 'nutrimax' | 'rioquality' | 'geral'
  metrica: string
  valor: number
  detalhe: Record<string, unknown> | null
}

type NfCalc = {
  nf: string
  carga: string
  status: string
  situacao: string
  chegada: string | null
  lat: number | null
  investigacao?: { categoria: string } | null
}
type PlacaCalc = {
  placa: string
  destino?: string
  cargas?: string[]
  saidaBase: string | null
  chegadaBase: string | null
  nfs: NfCalc[]
}
export type LinhaCalculo = {
  cliente: string
  data: string
  calculado_em: string | null
  ultimo_erro: string | null
  ultimo_erro_em?: string | null
  resultado: {
    calculadoEm?: string
    resumo: { taxa: number; totalNfs: number; nfsNaConta: number; entregues: number; aguardando?: number }
    placas: PlacaCalc[]
  } | null
}

export type Placar = {
  versao: 1
  dia: string
  gerado_em: string
  linhas: LinhaPlacar[]
  erros: { fonte: string; erro: string }[]
}

/** Meta de taxa por cliente (secao 1.2). Rio Quality ainda sem meta acordada. */
const META_TAXA: Record<string, number> = { nutrimax: 97 }
/** "Chegada no CD" ate' 30 min depois da saida com entrega depois dela = falsa (KRQ-07). */
const CHEGADA_LOGO_APOS_SAIDA_MIN = 30

const umDecimal = (x: number) => Math.round(x * 10) / 10

function fechamentoDoDia(data: string): number {
  const [a, m, d] = data.split('-').map(Number)
  return Date.parse(`${new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10)}T00:30:00-03:00`)
}

/** Metricas do calculo do Ao vivo (kpi_ao_vivo_calculo) de um cliente num dia. */
export function metricasDoAoVivo(dia: string, row: LinhaCalculo): LinhaPlacar[] {
  const cliente = row.cliente
  const out: LinhaPlacar[] = []
  const add = (metrica: string, valor: number, detalhe: Record<string, unknown> | null = null) => out.push({ dia, cliente, metrica, valor, detalhe })
  const r = row.resultado
  if (!r || !Array.isArray(r.placas)) {
    add('calculo_existe', 0)
    return out
  }
  add('calculo_existe', 1)

  const nfs = r.placas.flatMap(p => p.nfs.map(n => ({ ...n, placa: p.placa })))
  const cat = (n: NfCalc) => (/^ENTREGUE/.test(n.status) ? null : categoriaPendencia(n.status))
  const porSituacao = (s: string) => nfs.filter(n => n.situacao === s).length

  // Fora da conta: mesma regra de resumo-dashboard/gerador-xlsx -- carga sem
  // placa sempre; escala divergente so' quando a carga+placa INTEIRA tem o rotulo.
  const semPlaca = nfs.filter(n => cat(n) === 'Carga sem placa').length
  const grupos = new Map<string, NfCalc[]>()
  for (const n of nfs) grupos.set(`${n.carga}::${n.placa}`, [...(grupos.get(`${n.carga}::${n.placa}`) ?? []), n])
  let escalaFora = 0
  for (const lista of grupos.values()) if (lista.every(n => cat(n) === 'Placa da escala divergente')) escalaFora += lista.length

  const naConta = nfs.length - semPlaca - escalaFora
  const entregues = porSituacao('entregue') + porSituacao('sem_rastreador')
  const resumo = r.resumo
  add('taxa', resumo.taxa)
  add('nfs_total', resumo.totalNfs)
  add('nfs_na_conta', resumo.nfsNaConta)
  add('entregues_na_taxa', resumo.entregues)
  const divergencia = Math.abs(nfs.length - resumo.totalNfs) + Math.abs(naConta - resumo.nfsNaConta) + Math.abs(entregues - resumo.entregues)
  add('divergencia_resumo', divergencia, divergencia ? { recalculado: { nfs: nfs.length, naConta, entregues } } : null)

  const motivos: Record<string, number> = {}
  for (const n of nfs) if (n.situacao === 'revisar') { const c = cat(n) ?? 'Outros'; motivos[c] = (motivos[c] ?? 0) + 1 }
  add('revisar', porSituacao('revisar'), { por_categoria: motivos })
  add('nao_foi', porSituacao('nao_foi'))
  add('sem_rastreador', porSituacao('sem_rastreador'))
  add('aguardando', porSituacao('pendente'))
  add('nao_confirmada', porSituacao('nao_confirmada'))
  add('carga_sem_placa_fora', semPlaca)
  add('escala_divergente_fora', escalaFora)

  const meta = META_TAXA[cliente]
  if (meta != null) add('faltam_para_meta', Math.max(0, Math.ceil((meta * resumo.nfsNaConta) / 100) - resumo.entregues), { meta })

  // Placa real (com GPS, nao a carga "SEM PLACA") sem chegada no CD (KN-09).
  const semCd = r.placas
    .filter(p => p.placa !== 'SEM PLACA' && p.nfs.length > 0 && !p.nfs.every(n => n.situacao === 'sem_rastreador') && !p.chegadaBase)
    .map(p => p.placa).sort()
  add('placas_sem_chegada_cd', semCd.length, { placas: semCd })

  // "Chegada no CD" minutos depois da saida, com entrega depois dela (KRQ-07).
  const logo = r.placas.filter(p => {
    if (!p.saidaBase || !p.chegadaBase) return false
    const min = (Date.parse(p.chegadaBase) - Date.parse(p.saidaBase)) / 60_000
    if (!(min >= 0 && min <= CHEGADA_LOGO_APOS_SAIDA_MIN)) return false
    const horaCd = p.chegadaBase.slice(11, 16)
    return p.nfs.some(n => n.situacao === 'entregue' && n.chegada != null && n.chegada > horaCd)
  }).map(p => p.placa).sort()
  add('chegada_cd_logo_apos_saida', logo.length, { placas: logo })

  const comPonto = nfs.filter(n => n.lat != null).length
  add('nfs_com_ponto', comPonto)
  add('nfs_com_ponto_pct', nfs.length ? umDecimal((100 * comPonto) / nfs.length) : 0)
  const inv: Record<string, number> = {}
  for (const n of nfs) if (n.investigacao?.categoria) inv[n.investigacao.categoria] = (inv[n.investigacao.categoria] ?? 0) + 1
  add('investigacao_sem_coordenada', inv['sem_coordenada'] ?? 0, { por_categoria: inv })

  const calc = row.calculado_em ? Date.parse(row.calculado_em) : NaN
  add('calculo_final', Number.isFinite(calc) && calc >= fechamentoDoDia(row.data) ? 1 : 0, { calculado_em: row.calculado_em })
  add('calculo_com_erro', row.ultimo_erro ? 1 : 0, row.ultimo_erro ? { erro: row.ultimo_erro.slice(0, 300), em: row.ultimo_erro_em ?? null } : null)
  return out
}

const NOMES_CLIENTE: Record<string, string> = { nutrimax: 'nutrimax', 'nutry max': 'nutrimax', rioquality: 'rioquality', 'rio quality': 'rioquality' }

/** Linhas ja' agregadas por SQL (monitoramento, tabelas do KPI) -> linhas do placar. */
export function metricasAgregadas(dia: string, rows: { cliente: string | null; metrica: string; valor: number; detalhe?: Record<string, unknown> | null }[]): LinhaPlacar[] {
  return rows.map(r => {
    const conhecido = r.cliente ? NOMES_CLIENTE[r.cliente.trim().toLowerCase()] : undefined
    const detalhe = conhecido ? (r.detalhe ?? null) : { ...(r.cliente ? { cliente: r.cliente } : {}), ...(r.detalhe ?? {}) }
    return { dia, cliente: conhecido ?? 'geral', metrica: r.metrica, valor: Number(r.valor), detalhe: detalhe && Object.keys(detalhe).length ? detalhe : null }
  })
}

const OFFSET_H: Record<string, number> = { CEST: 2, CET: 1, UTC: 0, GMT: 0 }

/** Statement timeouts do log do Postgres (horario do servidor, Berlim) que
 *  caem no dia `dia` de Brasilia. */
export function contarTimeoutsDoDia(linhas: string[], dia: string): number {
  let n = 0
  for (const l of linhas) {
    if (!l.includes('canceling statement due to statement timeout')) continue
    const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(?:\.\d+)? ([A-Z]{3,4})\b/.exec(l)
    if (!m || OFFSET_H[m[3]] == null) continue
    const utc = Date.parse(`${m[1]}T${m[2]}Z`) - OFFSET_H[m[3]] * 3600_000
    if (new Date(utc - 3 * 3600_000).toISOString().slice(0, 10) === dia) n++
  }
  return n
}

/** Dia medido pelo placar: ontem, no calendario de Brasilia. */
export function diaDoPlacar(agoraMs: number): string {
  const hojeBrt = new Date(agoraMs - 3 * 3600_000).toISOString().slice(0, 10)
  const d = new Date(`${hojeBrt}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export function montarPlacar(dia: string, geradoEm: string, grupos: LinhaPlacar[][], erros: { fonte: string; erro: string }[]): Placar {
  return { versao: 1, dia, gerado_em: geradoEm, linhas: grupos.flat(), erros }
}
