// F3-07 (ACH-04): ligações reais do checklist da manhã e do aviso de romaneio
// ausente (banco, ponte do monitoramento). A regra mora em manha.ts.
// Estado em kpi_cache_dia (sem migration; apagado com 7 dias pela limpeza
// das 04h). Fail-open: nada aqui derruba o tick, o envio do romaneio ou a tela.
import { createServiceClient } from '@/lib/supabase/service'
import { COD_USER_NUTRIMAX } from './constants'
import type { ClienteAoVivo } from './ao-vivo-servico'
import {
  MAX_TENTATIVAS_DM, bannersAvisoRomaneio, checklistDaManha, decidirAvisoRomaneio, marcoDaVez, partesPresentes, registrarChegadas,
  type BannerAvisoRomaneio, type ChegadasDia, type DiaGuardadoManha, type EstadoAvisoRomaneio, type FaltaRomaneio, type ItemChecklist, type RegistroMarco,
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

export type FrotaMonitoramento = { emRota: number; semRomaneio: number }

/** Carros do cliente em rota agora (monitoramento: GPS fresco, ignição, >5 km
 *  da base) e quantos deles sem romaneio do dia no monitoramento. null = não
 *  deu para saber -- nunca vira "frota parada". Revisão F3-07 (R6): todo
 *  "não sei" registra o motivo (404 = monitoramento sem a rota, 401 = chave,
 *  500 = erro da consulta, timeout, resposta estranha, sem MOTOR_SECRET). */
export async function frotaEmRotaNoMonitoramento(
  cliente: ClienteAoVivo, data: string,
  opcoes: { fetch?: typeof fetch; env?: Record<string, string | undefined> } = {},
): Promise<FrotaMonitoramento | null> {
  const naoSei = (motivo: string) => { logErro(`frota-em-rota ${cliente} ${data}`, motivo); return null }
  const env = opcoes.env ?? process.env
  const chave = env.MOTOR_SECRET
  if (!chave) return naoSei('sem MOTOR_SECRET no ambiente')
  const base = env.MONITORAMENTO_URL ?? 'http://127.0.0.1:3010'
  try {
    const r = await (opcoes.fetch ?? fetch)(`${base}/api/romaneio/frota-em-rota?data=${encodeURIComponent(data)}&cod=${COD_MONITORAMENTO[cliente]}`, {
      headers: { 'x-motor-key': chave }, signal: AbortSignal.timeout(15_000),
    })
    const j = (await r.json().catch(() => ({}))) as { emRota?: unknown; semRomaneio?: unknown; erro?: unknown }
    if (!r.ok) return naoSei(`HTTP ${r.status}${typeof j.erro === 'string' ? ` (${j.erro.slice(0, 200)})` : ''}`)
    if (typeof j.emRota !== 'number') return naoSei('resposta sem emRota')
    // Monitoramento sem semRomaneio (versão antiga da ponte): trata todos os
    // carros em rota como sem destino, como antes da revisão.
    return { emRota: j.emRota, semRomaneio: typeof j.semRomaneio === 'number' ? j.semRomaneio : j.emRota }
  } catch (err) {
    return naoSei(err instanceof Error ? err.message : String(err))
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
  const enviadoEm = Object.fromEntries(clientes.map(c => [c, dias[c]?.enviado_em ?? null]))
  return {
    itens: checklistDaManha({ clientes, dias, chegadas: chegadasPor }),
    banners: bannersAvisoRomaneio(aviso as EstadoAvisoRomaneio | null, clientes, chegou, enviadoEm),
  }
}

// ─── Tick ──────────────────────────────────────────────────────────────────

/** A DM ao dono sai só com KPI_AVISO_ROMANEIO_DM=1 (desligada por padrão). */
export const avisoRomaneioLigado = (env: Record<string, string | undefined> = process.env) => env.KPI_AVISO_ROMANEIO_DM === '1'

export type DepsAvisoRomaneio = {
  lerEstado: (data: string) => Promise<EstadoAvisoRomaneio | null>
  gravarEstado: (data: string, e: EstadoAvisoRomaneio) => Promise<boolean>
  /** Clientes ativos do Ao vivo. */
  clientes: ClienteAoVivo[]
  /** Clientes sem o documento de hoje no KPI (texto, banner e fallback). */
  semDocumentoKpi: (data: string) => Promise<ClienteAoVivo[]>
  frota: (cliente: ClienteAoVivo, data: string) => Promise<FrotaMonitoramento | null>
  /** true = DM entregue ao alertar-dm (R5). */
  enviar: (chave: string, texto: string) => Promise<boolean>
  agoraMs: number
  ligado: boolean
  log: (m: string) => void
}

/** 06:30 e 07:30 BRT: carros do cliente rodando sem romaneio no
 *  monitoramento (R3: decide pelo monitoramento; o documento do KPI só vale
 *  quando o monitoramento não responde) -> grava o aviso (banner da tela) e
 *  prepara a DM ao dono. Uma vez por marco; DM que falhou tenta de novo nos
 *  ticks seguintes (R5, MAX_TENTATIVAS_DM). */
export async function avisarRomaneioAusente(data: string, deps: DepsAvisoRomaneio): Promise<'nada' | 'desligado' | 'enviado' | 'falhou'> {
  const estado = await deps.lerEstado(data)
  const vez = marcoDaVez(estado, deps.agoraMs)
  if (!vez) return 'nada'
  const em = new Date(deps.agoraMs).toISOString()
  const semDocumento = new Set(await deps.semDocumentoKpi(data))
  const faltando: FaltaRomaneio[] = []
  for (const cliente of deps.clientes) {
    const kpiTemDocumento = !semDocumento.has(cliente)
    const f = await deps.frota(cliente, data)
    if (f) faltando.push({ cliente, emRota: f.emRota, semRomaneio: f.semRomaneio, kpiTemDocumento })
    else if (!kpiTemDocumento) faltando.push({ cliente, emRota: null, semRomaneio: null, kpiTemDocumento })
  }
  const { avisar, texto } = decidirAvisoRomaneio({ marco: vez.marco, faltando })
  const tentativas = (estado?.marcos[vez.marco]?.tentativas ?? 0) + 1
  let dm: RegistroMarco['dm'] = !texto ? null : deps.ligado ? 'falhou' : 'desligado'
  // R5: envia ANTES de gravar e só grava "enviado" se o alertar-dm entregou.
  // Gravar falhar depois do envio = o próximo tick reavalia e reenvia com a
  // mesma chave (o alertar-dm segura 1 por chave a cada 6 h).
  if (texto && deps.ligado) {
    const ok = await deps.enviar(`romaneio-ausente-${data}-${vez.marco.replace(':', '')}`, texto).catch(() => false)
    dm = ok ? 'enviado' : 'falhou'
  }
  const novo: EstadoAvisoRomaneio = { marcos: { ...(estado?.marcos ?? {}) } }
  for (const m of vez.pulados) novo.marcos[m] = { em, faltando: [], dm: 'pulado' }
  novo.marcos[vez.marco] = { em, faltando, dm, ...(texto && deps.ligado ? { tentativas } : {}) }
  if (!(await deps.gravarEstado(data, novo))) deps.log(`aviso de romaneio ${vez.marco}: não consegui gravar o estado (o próximo tick tenta de novo)`)
  if (!texto) {
    deps.log(`aviso de romaneio ${vez.marco}: nada a avisar (${faltando.length ? faltando.map(f => `${f.cliente} sem romaneio no monitoramento ${f.semRomaneio ?? '?'} de ${f.emRota ?? '?'} em rota`).join(', ') : 'romaneios no lugar'})`)
    return 'nada'
  }
  if (!deps.ligado) {
    deps.log(`aviso de romaneio preparado, envio desligado (KPI_AVISO_ROMANEIO_DM): ${texto}`)
    return 'desligado'
  }
  if (dm === 'falhou') {
    deps.log(`aviso de romaneio ${vez.marco}: DM ao dono falhou (tentativa ${tentativas} de ${MAX_TENTATIVAS_DM}${tentativas < MAX_TENTATIVAS_DM ? ', o próximo tick tenta de novo' : ''})`)
    return 'falhou'
  }
  deps.log(`aviso de romaneio ${vez.marco} enviado ao dono (${avisar.map(a => a.cliente).join(', ')})`)
  return 'enviado'
}

export function depsReaisAvisoRomaneio(clientes: ClienteAoVivo[], enviar: DepsAvisoRomaneio['enviar'], log: (m: string) => void): DepsAvisoRomaneio {
  return {
    lerEstado: d => lerValor<EstadoAvisoRomaneio>(chaveAvisoRomaneio(d), {}),
    gravarEstado: (d, e) => gravarValor(chaveAvisoRomaneio(d), d, e, {}).then(() => true, err => { logErro('gravação do aviso', err); return false }),
    clientes,
    semDocumentoKpi: d => clientesSemRomaneio(clientes, d),
    frota: (c, d) => frotaEmRotaNoMonitoramento(c, d),
    enviar,
    agoraMs: Date.now(),
    ligado: avisoRomaneioLigado(),
    log,
  }
}
