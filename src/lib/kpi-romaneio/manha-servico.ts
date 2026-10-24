// F3-07 (ACH-04): ligações reais do checklist da manhã e do aviso de romaneio
// ausente (banco, ponte do monitoramento). A regra mora em manha.ts.
// Estado em kpi_cache_dia (sem migration; apagado com 7 dias pela limpeza
// das 04h). Fail-open: nada aqui derruba o tick, o envio do romaneio ou a tela.
import { createServiceClient } from '@/lib/supabase/service'
import { COD_USER_NUTRIMAX } from './constants'
import type { ClienteAoVivo } from './ao-vivo-servico'
import {
  bannersAvisoRomaneio, checklistDaManha, decidirAvisoRomaneio, marcoDaVez, partesPresentes, registrarChegadas,
  type BannerAvisoRomaneio, type ChegadasDia, type DiaGuardadoManha, type EstadoAvisoRomaneio, type FaltaRomaneio, type ItemChecklist,
} from './manha'

type ClienteBanco = Pick<ReturnType<typeof createServiceClient>, 'from'>
type Opcoes = { cliente?: () => ClienteBanco }

const COD_MONITORAMENTO: Record<ClienteAoVivo, string> = { nutrimax: COD_USER_NUTRIMAX, rioquality: '598' }

export const chaveAvisoRomaneio = (data: string) => `aviso-romaneio:${data}`
export const chaveChegadas = (cliente: ClienteAoVivo, data: string) => `chegadas-dia:${cliente}:${data}`

const logErro = (o: string, err: unknown) =>
  console.error(`${new Date().toISOString()} [kpi-romaneio/manha] ${o} falhou:`, err instanceof Error ? err.message : err)

async function lerValor<T>(chave: string, opcoes: Opcoes): Promise<T | null> {
  const { data, error } = await (opcoes.cliente ?? createServiceClient)().from('kpi_cache_dia').select('valor').eq('chave', chave).maybeSingle()
  if (error) throw new Error(error.message)
  return ((data as { valor?: T } | null)?.valor) ?? null
}

async function gravarValor(chave: string, data: string, valor: unknown, opcoes: Opcoes): Promise<void> {
  const { error } = await (opcoes.cliente ?? createServiceClient)().from('kpi_cache_dia')
    .upsert({ chave, data, valor, gravado_em: new Date().toISOString() }, { onConflict: 'chave' })
  if (error) throw new Error(error.message)
}

/** Chamado ao guardar o dia do Ao vivo: anota a primeira chegada de cada parte. */
export async function registrarChegadasDoDia(cliente: ClienteAoVivo, data: string, dia: DiaGuardadoManha, em: string, opcoes: Opcoes = {}): Promise<void> {
  try {
    const anterior = await lerValor<ChegadasDia>(chaveChegadas(cliente, data), opcoes)
    const novo = registrarChegadas(anterior, partesPresentes(dia), em)
    if (novo) await gravarValor(chaveChegadas(cliente, data), data, novo, opcoes)
  } catch (err) {
    logErro('registro de chegada', err)
  }
}

/** Carros do cliente em rota agora (monitoramento: GPS fresco, ignição, >5 km
 *  da base). null = não deu para saber -- nunca vira "frota parada". */
export async function frotaEmRotaNoMonitoramento(
  cliente: ClienteAoVivo, data: string,
  opcoes: { fetch?: typeof fetch; env?: Record<string, string | undefined> } = {},
): Promise<number | null> {
  const env = opcoes.env ?? process.env
  const chave = env.MOTOR_SECRET
  if (!chave) return null
  const base = env.MONITORAMENTO_URL ?? 'http://127.0.0.1:3010'
  try {
    const r = await (opcoes.fetch ?? fetch)(`${base}/api/romaneio/frota-em-rota?data=${encodeURIComponent(data)}&cod=${COD_MONITORAMENTO[cliente]}`, {
      headers: { 'x-motor-key': chave }, signal: AbortSignal.timeout(15_000),
    })
    if (!r.ok) return null
    const j = (await r.json().catch(() => ({}))) as { emRota?: unknown }
    return typeof j.emRota === 'number' ? j.emRota : null
  } catch {
    return null
  }
}

const SELECT_DIA = 'cliente, romaneio, pao, escala_enviada, pao_enviado, enviado_em'

async function diasGuardados(clientes: ClienteAoVivo[], data: string, opcoes: Opcoes): Promise<Partial<Record<ClienteAoVivo, DiaGuardadoManha>>> {
  const { data: linhas, error } = await (opcoes.cliente ?? createServiceClient)().from('kpi_ao_vivo_dia')
    .select(SELECT_DIA).eq('data', data).in('cliente', clientes)
  if (error) throw new Error(error.message)
  const dias: Partial<Record<ClienteAoVivo, DiaGuardadoManha>> = {}
  for (const l of (linhas ?? []) as (DiaGuardadoManha & { cliente: ClienteAoVivo })[]) dias[l.cliente] = l
  return dias
}

const temDocumento = (d: DiaGuardadoManha | undefined) => !!d && (d.romaneio ?? []).length > 0

/** Clientes do Ao vivo sem o romaneio (Nutry) / relatório (RQ) de hoje. */
export async function clientesSemRomaneio(clientes: ClienteAoVivo[], data: string, opcoes: Opcoes = {}): Promise<ClienteAoVivo[]> {
  const dias = await diasGuardados(clientes, data, opcoes)
  return clientes.filter(c => !temDocumento(dias[c]))
}

export async function lerManha(clientes: ClienteAoVivo[], data: string, opcoes: Opcoes = {}): Promise<{ itens: ItemChecklist[]; banners: BannerAvisoRomaneio[] }> {
  const [dias, aviso, ...chegadas] = await Promise.all([
    diasGuardados(clientes, data, opcoes),
    lerValor<EstadoAvisoRomaneio>(chaveAvisoRomaneio(data), opcoes).catch(err => { logErro('leitura do aviso', err); return null }),
    ...clientes.map(c => lerValor<ChegadasDia>(chaveChegadas(c, data), opcoes).catch(() => null)),
  ])
  const chegadasPor = Object.fromEntries(clientes.map((c, i) => [c, chegadas[i] as ChegadasDia | null]))
  const chegou = Object.fromEntries(clientes.map(c => [c, temDocumento(dias[c])]))
  return {
    itens: checklistDaManha({ clientes, dias, chegadas: chegadasPor }),
    banners: bannersAvisoRomaneio(aviso as EstadoAvisoRomaneio | null, clientes, chegou),
  }
}

// ─── Tick ──────────────────────────────────────────────────────────────────

/** A DM ao dono sai só com KPI_AVISO_ROMANEIO_DM=1 (desligada por padrão). */
export const avisoRomaneioLigado = (env: Record<string, string | undefined> = process.env) => env.KPI_AVISO_ROMANEIO_DM === '1'

export type DepsAvisoRomaneio = {
  lerEstado: (data: string) => Promise<EstadoAvisoRomaneio | null>
  gravarEstado: (data: string, e: EstadoAvisoRomaneio) => Promise<boolean>
  faltando: (data: string) => Promise<ClienteAoVivo[]>
  frota: (cliente: ClienteAoVivo, data: string) => Promise<number | null>
  enviar: (chave: string, texto: string) => Promise<void>
  agoraMs: number
  ligado: boolean
  log: (m: string) => void
}

/** 06:30 e 07:30 BRT: falta romaneio de cliente ativo com a frota rodando ->
 *  grava o aviso (banner da tela) e prepara a DM ao dono. Uma vez por marco. */
export async function avisarRomaneioAusente(data: string, deps: DepsAvisoRomaneio): Promise<'nada' | 'desligado' | 'enviado'> {
  const estado = await deps.lerEstado(data)
  const vez = marcoDaVez(estado, deps.agoraMs)
  if (!vez) return 'nada'
  const em = new Date(deps.agoraMs).toISOString()
  const faltam = await deps.faltando(data)
  const faltando: FaltaRomaneio[] = []
  for (const cliente of faltam) faltando.push({ cliente, emRota: await deps.frota(cliente, data) })
  const { avisar, texto } = decidirAvisoRomaneio({ marco: vez.marco, faltando })
  const dm = !texto ? null : deps.ligado ? 'enviado' as const : 'desligado' as const
  const novo: EstadoAvisoRomaneio = { marcos: { ...(estado?.marcos ?? {}) } }
  for (const m of vez.pulados) novo.marcos[m] = { em, faltando: [], dm: 'pulado' }
  novo.marcos[vez.marco] = { em, faltando, dm }
  if (!(await deps.gravarEstado(data, novo))) deps.log(`aviso de romaneio ${vez.marco}: não consegui gravar o estado (o próximo tick tenta de novo)`)
  if (!texto) {
    deps.log(`aviso de romaneio ${vez.marco}: nada a avisar (${faltando.length ? faltando.map(f => `${f.cliente} frota ${f.emRota ?? '?'}`).join(', ') : 'romaneios no lugar'})`)
    return 'nada'
  }
  if (!deps.ligado) {
    deps.log(`aviso de romaneio preparado, envio desligado (KPI_AVISO_ROMANEIO_DM): ${texto}`)
    return 'desligado'
  }
  await deps.enviar(`romaneio-ausente-${data}-${vez.marco.replace(':', '')}`, texto)
  deps.log(`aviso de romaneio ${vez.marco} enviado ao dono (${avisar.map(a => a.cliente).join(', ')})`)
  return 'enviado'
}

export function depsReaisAvisoRomaneio(clientes: ClienteAoVivo[], enviar: DepsAvisoRomaneio['enviar'], log: (m: string) => void): DepsAvisoRomaneio {
  return {
    lerEstado: d => lerValor<EstadoAvisoRomaneio>(chaveAvisoRomaneio(d), {}),
    gravarEstado: (d, e) => gravarValor(chaveAvisoRomaneio(d), d, e, {}).then(() => true, err => { logErro('gravação do aviso', err); return false }),
    faltando: d => clientesSemRomaneio(clientes, d),
    frota: (c, d) => frotaEmRotaNoMonitoramento(c, d),
    enviar,
    agoraMs: Date.now(),
    ligado: avisoRomaneioLigado(),
    log,
  }
}
