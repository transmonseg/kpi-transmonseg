// F3-07 (ACH-04): checklist da manhã e aviso interno de romaneio ausente.
//
// O romaneio da Nutry chegou entre 08:27 e 15:40 (14–23/10), mas as cargas
// saem entre 05:41 e 07:18: o motor de desvio e o Ao vivo ficavam cegos a
// manhã toda e o único alarme era o da auditoria do dia seguinte (só Nutry).
//
// - Checklist: romaneio, pão (JAC), escala e relatório da RQ, cada um com o
//   horário da primeira chegada (registrada em kpi_cache_dia ao guardar o dia).
// - Aviso às 06:30 e 07:30 BRT, decidido no tick pelo estado gravado (não por
//   horário fixo do cron): falta o romaneio de cliente ativo E a frota está
//   rodando (ponte do monitoramento, mesma regra do card romaneio_ausente).
//   Banner na tela e DM ao dono (alertar-dm), esta desligada por padrão.
//   Nunca ao cliente.
// Funções puras; banco e ponte ficam em manha-servico.ts.
import type { ClienteAoVivo } from './ao-vivo-servico'

export const MARCOS_AVISO_ROMANEIO = ['06:30', '07:30'] as const
export type MarcoAviso = (typeof MARCOS_AVISO_ROMANEIO)[number]
/** Menos que isso em rota = frota parada (domingo 19/10: 1 carro da Nutry andando). */
export const FROTA_RODANDO_MIN = 3

const NOME: Record<ClienteAoVivo, string> = { nutrimax: 'Nutry Max', rioquality: 'Rio Quality' }
const DOCUMENTO: Record<ClienteAoVivo, string> = { nutrimax: 'romaneio', rioquality: 'relatório de entregas' }

/** Minuto do dia no horário de Brasília (o servidor roda em Europe/Berlin). */
export function minutoBR(ms: number): number {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms))
  const n = (t: string) => Number(p.find(x => x.type === t)?.value ?? 0)
  return n('hour') * 60 + n('minute')
}

const minutoDoMarco = (m: string) => Number(m.slice(0, 2)) * 60 + Number(m.slice(3, 5))

export function hhmmBR(iso: string | null | undefined): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  return new Date(t).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
}

// ─── Chegadas ──────────────────────────────────────────────────────────────

export type ParteDia = 'romaneio' | 'pao' | 'escala'
export type ChegadasDia = Partial<Record<ParteDia, string>>

export type DiaGuardadoManha = {
  romaneio: unknown[] | null
  pao: { linhas?: unknown[] } | null
  escala_enviada: boolean | null
  pao_enviado: boolean | null
  enviado_em?: string | null
}

export function partesPresentes(d: DiaGuardadoManha): ParteDia[] {
  const partes: ParteDia[] = []
  if ((d.romaneio ?? []).length > 0) partes.push('romaneio')
  if (d.pao_enviado || (d.pao?.linhas ?? []).length > 0) partes.push('pao')
  if (d.escala_enviada) partes.push('escala')
  return partes
}

/** Primeira chegada de cada parte; null = nada novo (não grava). */
export function registrarChegadas(anterior: ChegadasDia | null, partes: ParteDia[], em: string): ChegadasDia | null {
  const novo: ChegadasDia = { ...(anterior ?? {}) }
  let mudou = false
  for (const p of partes) if (!novo[p]) { novo[p] = em; mudou = true }
  return mudou ? novo : null
}

// ─── Checklist ─────────────────────────────────────────────────────────────

export type ItemChecklist = {
  chave: 'romaneio' | 'pao' | 'escala' | 'rq'
  rotulo: string
  documento: string
  cliente: ClienteAoVivo
  ok: boolean
  hora: string | null
}

export function checklistDaManha(p: {
  clientes: ClienteAoVivo[]
  dias: Partial<Record<ClienteAoVivo, DiaGuardadoManha | null>>
  chegadas: Partial<Record<ClienteAoVivo, ChegadasDia | null>>
}): ItemChecklist[] {
  const itens: ItemChecklist[] = []
  const hora = (c: ClienteAoVivo, parte: ParteDia) => hhmmBR(p.chegadas[c]?.[parte] ?? p.dias[c]?.enviado_em ?? null)
  if (p.clientes.includes('nutrimax')) {
    const d = p.dias.nutrimax
    const tem = new Set(d ? partesPresentes(d) : [])
    const item = (chave: ParteDia, rotulo: string, documento: string): ItemChecklist =>
      ({ chave, rotulo, documento, cliente: 'nutrimax', ok: tem.has(chave), hora: tem.has(chave) ? hora('nutrimax', chave) : null })
    itens.push(item('romaneio', 'Romaneio Nutry', 'Romaneio de Entrega'))
    itens.push(item('pao', 'Pão (JAC)', 'Romaneio do Pão (Programação JAC)'))
    itens.push(item('escala', 'Escala', 'Escala de entregas'))
  }
  if (p.clientes.includes('rioquality')) {
    const d = p.dias.rioquality
    const ok = !!d && (d.romaneio ?? []).length > 0
    itens.push({ chave: 'rq', rotulo: 'Relatório RQ', documento: 'Relatório de Entregas da Rio Quality', cliente: 'rioquality', ok, hora: ok ? hora('rioquality', 'romaneio') : null })
  }
  return itens
}

// ─── Aviso das 06:30 / 07:30 ───────────────────────────────────────────────

/** emRota/semRomaneio null = não consegui perguntar ao monitoramento.
 *  Revisão F3-07 (R3): a decisão é pelos carros SEM romaneio no monitoramento
 *  (semRomaneio), não pela presença do documento no KPI -- romaneio parcial,
 *  envio ao monitoramento que falhou e romaneio que só está no monitoramento
 *  enganavam o aviso. kpiTemDocumento fica para o texto e o banner. Estado
 *  gravado antes da revisão não tem semRomaneio: vale emRota (só clientes
 *  sem documento eram gravados). */
export type FaltaRomaneio = { cliente: ClienteAoVivo; emRota: number | null; semRomaneio?: number | null; kpiTemDocumento?: boolean }

/** R5: DM que falhou é tentada de novo nos ticks seguintes, até este total. */
export const MAX_TENTATIVAS_DM = 3

export type RegistroMarco = { em: string; faltando: FaltaRomaneio[]; dm: 'enviado' | 'desligado' | 'pulado' | 'falhou' | null; tentativas?: number }

const marcoFeito = (r: RegistroMarco | undefined) => !!r && !(r.dm === 'falhou' && (r.tentativas ?? 1) < MAX_TENTATIVAS_DM)
export type EstadoAvisoRomaneio = { marcos: Partial<Record<MarcoAviso, RegistroMarco>> }

/** O marco a avaliar neste tick: o mais recente já vencido e ainda não feito.
 *  Os anteriores não feitos (tick parado) ficam pulados -- um aviso só. */
export function marcoDaVez(estado: EstadoAvisoRomaneio | null, agoraMs: number): { marco: MarcoAviso; pulados: MarcoAviso[] } | null {
  const agora = minutoBR(agoraMs)
  const vencidos = MARCOS_AVISO_ROMANEIO.filter(m => agora >= minutoDoMarco(m))
  const ultimo = vencidos[vencidos.length - 1]
  if (!ultimo || marcoFeito(estado?.marcos[ultimo])) return null
  return { marco: ultimo, pulados: vencidos.slice(0, -1).filter(m => !estado?.marcos[m]) }
}

/** Carros rodando sem destino no monitoramento (null = não deu para saber). */
const semDestino = (f: FaltaRomaneio): number | null => f.semRomaneio ?? f.emRota

function rodando(f: FaltaRomaneio): boolean {
  const n = semDestino(f)
  // Monitoramento fora: só o documento do KPI diz algo -- sem ele, avisa
  // dizendo que não conferiu (nunca calado); com ele, nada a afirmar.
  if (n == null) return !f.kpiTemDocumento
  return n >= FROTA_RODANDO_MIN
}

function frase(f: FaltaRomaneio): string {
  const n = semDestino(f)
  if (n == null) return `${NOME[f.cliente]} sem ${DOCUMENTO[f.cliente]} de hoje (não consegui conferir a frota no monitoramento)`
  if (f.kpiTemDocumento) {
    return `${NOME[f.cliente]} com ${n} carros rodando sem romaneio no monitoramento (o ${DOCUMENTO[f.cliente]} de hoje está no KPI: incompleto ou não chegou ao monitoramento)`
  }
  return `${NOME[f.cliente]} sem ${DOCUMENTO[f.cliente]} de hoje com ${n} carros rodando`
}

export function decidirAvisoRomaneio(p: { marco: MarcoAviso; faltando: FaltaRomaneio[] }): { avisar: FaltaRomaneio[]; texto: string | null } {
  const avisar = p.faltando.filter(rodando)
  if (avisar.length === 0) return { avisar, texto: null }
  return {
    avisar,
    texto: `KPI ${p.marco}: ${avisar.map(frase).join('; ')}. `
      + 'O motor de desvio está sem os destinos desses carros: subir no Ao vivo (kpi.transmonseg.com.br/painel/ao-vivo).',
  }
}

export type BannerAvisoRomaneio = { cliente: ClienteAoVivo; texto: string }

/** Banner do Ao vivo: último marco avaliado, só dos clientes do login e só
 *  enquanto o documento ainda não chegou. R3: quando o documento já estava no
 *  KPI e faltava destino no monitoramento, some com o próximo envio depois
 *  do aviso (`enviadoEm`, kpi_ao_vivo_dia.enviado_em). */
export function bannersAvisoRomaneio(
  estado: EstadoAvisoRomaneio | null,
  clientes: ClienteAoVivo[],
  chegou: Partial<Record<ClienteAoVivo, boolean>>,
  enviadoEm: Partial<Record<ClienteAoVivo, string | null>> = {},
): BannerAvisoRomaneio[] {
  if (!estado) return []
  const marco = [...MARCOS_AVISO_ROMANEIO].reverse().find(m => estado.marcos[m] && estado.marcos[m]!.dm !== 'pulado')
  if (!marco) return []
  const registro = estado.marcos[marco]!
  const resolvido = (f: FaltaRomaneio) => f.kpiTemDocumento
    ? (Date.parse(enviadoEm[f.cliente] ?? '') || 0) > (Date.parse(registro.em) || Infinity)
    : !!chegou[f.cliente]
  return (registro.faltando ?? [])
    .filter(f => rodando(f) && clientes.includes(f.cliente) && !resolvido(f))
    .map(f => {
      const n = semDestino(f)
      if (f.kpiTemDocumento) {
        return { cliente: f.cliente, texto: `Motor de desvio sem destino de ${n} carros da ${NOME[f.cliente]} às ${marco}: ${DOCUMENTO[f.cliente]} de hoje incompleto ou não chegou ao monitoramento.` }
      }
      return {
        cliente: f.cliente,
        texto: `Motor de desvio sem ${DOCUMENTO[f.cliente]} da ${NOME[f.cliente]} hoje: `
          + (n == null ? `frota não conferida às ${marco}.` : `${n} carros rodando às ${marco}.`),
      }
    })
}
