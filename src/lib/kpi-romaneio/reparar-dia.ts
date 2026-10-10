// Reparo do dia no tick do Ao vivo (10/10): em 09/10 e 10/10 o romaneio foi
// gerado so' pelo fluxo "Gerar KPI" (ou o envio ao monitoramento falhou) e o
// motor de desvio ficou cego ate' alguem corrigir na mao. A cada tick:
//  1) Ao vivo sem o dia + geracao com romaneio => preenche o Ao vivo;
//  2) monitoramento sem romaneio do dia => reenvia os PDFs da geracao.
// So' Nutry Max, so' hoje (BRT), no maximo um reenvio por tick, fail-open.
import { existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServiceClient } from '@/lib/supabase/service'
import { entradaDaGeracao } from './entrada-geracao'
import { guardarDiaAoVivo } from './ao-vivo-servico'
import { enviarAoMonitoramento, type ArquivoMonitoramento } from './enviar-monitoramento'

const BUCKET = 'kpi-romaneio-inputs'
const CLIENTE = 'nutrimax' as const

export type AcaoReparo = 'preencher_ao_vivo' | 'enviar_monitoramento' | 'nada'

/** `monitoramentoTemRomaneio` null = nao deu pra saber (nunca reenvia). */
export function decidirReparo(p: { aoVivoTemDia: boolean; geracaoTemDia: boolean; monitoramentoTemRomaneio: boolean | null }): AcaoReparo {
  // Dia ja' guardado (por humano ou pelo reparo) nunca e' sobrescrito.
  if (!p.aoVivoTemDia && p.geracaoTemDia) return 'preencher_ao_vivo'
  // Sem PDFs da geracao nao ha' o que reenviar.
  if (p.geracaoTemDia && p.monitoramentoTemRomaneio === false) return 'enviar_monitoramento'
  return 'nada'
}

export type DepsReparo = {
  aoVivoTemDia(data: string): Promise<boolean>
  geracaoTemDia(data: string): Promise<boolean>
  /** Linhas de romaneio (origem romaneio, modo real) do dia no monitoramento; null = indisponivel. */
  linhasNoMonitoramento(data: string): Promise<number | null>
  preencherAoVivo(data: string): Promise<void>
  reenviarAoMonitoramento(data: string): Promise<{ ok: boolean; erro?: string }>
  /** Ja' houve uma tentativa de reenvio hoje (trava contra loop e contra desfazer o "Reverter" do operador). */
  jaTentouReenvio?(data: string): boolean
  marcarTentativaReenvio?(data: string): void
  /** Dia do Ao vivo subido por pessoa (email): esse envio ja' repassa ao monitoramento sozinho e pode ser mais novo que a geracao. */
  aoVivoEnviadoPorPessoa?(data: string): Promise<boolean>
}

/** Devolve as acoes executadas (so' pra log/teste). Nunca lanca. */
export async function repararDia(deps: DepsReparo, data: string, log: (m: string) => void): Promise<AcaoReparo[]> {
  const feitas: AcaoReparo[] = []
  try {
    let aoVivoTemDia = await deps.aoVivoTemDia(data)
    const geracaoTemDia = await deps.geracaoTemDia(data)
    if (!aoVivoTemDia && !geracaoTemDia) return feitas
    const consultarMonitoramento = async () => {
      const n = await deps.linhasNoMonitoramento(data)
      return n === null ? null : n > 0
    }
    let monitoramentoTemRomaneio = await consultarMonitoramento()
    let acao = decidirReparo({ aoVivoTemDia, geracaoTemDia, monitoramentoTemRomaneio })
    if (acao === 'preencher_ao_vivo') {
      // Reconfere logo antes de escrever: alguem pode ter subido o dia agora.
      if (await deps.aoVivoTemDia(data)) {
        aoVivoTemDia = true
      } else {
        await deps.preencherAoVivo(data)
        feitas.push('preencher_ao_vivo')
        log(`[reparo] ${CLIENTE} ${data}: Ao vivo preenchido a partir da geracao do dia`)
        aoVivoTemDia = true
      }
      acao = decidirReparo({ aoVivoTemDia, geracaoTemDia, monitoramentoTemRomaneio })
    }
    if (acao === 'enviar_monitoramento') {
      // Uma tentativa por dia: sem isso o reparo desfazia o "Reverter" do operador
      // a cada tick e repetia sem fim quando o PDF tem data de outro dia no cabecalho.
      if (deps.jaTentouReenvio?.(data)) return feitas
      // Ao vivo subido por pessoa: a versao dela e' a mais nova; a geracao pode ser outra.
      if (await deps.aoVivoEnviadoPorPessoa?.(data)) {
        log(`[reparo] ${CLIENTE} ${data}: monitoramento sem romaneio, mas o Ao vivo foi enviado por pessoa -- nao reenvio a geracao (versao pode ser outra)`)
        return feitas
      }
      deps.marcarTentativaReenvio?.(data)
      const r = await deps.reenviarAoMonitoramento(data)
      feitas.push('enviar_monitoramento')
      log(r.ok
        ? `[reparo] ${CLIENTE} ${data}: monitoramento sem romaneio, PDFs da geracao reenviados`
        : `[reparo] ${CLIENTE} ${data}: reenvio ao monitoramento falhou: ${r.erro ?? 'erro desconhecido'}`)
    }
  } catch (err) {
    log(`[reparo] ${CLIENTE} ${data}: erro ignorado: ${err instanceof Error ? err.message : String(err)}`)
  }
  return feitas
}

type CaminhosGeracao = { escala: string | null; romaneio: string; pao: string | null }

async function caminhosDaGeracao(data: string): Promise<CaminhosGeracao | null> {
  const { data: g, error } = await createServiceClient().from('kpi_romaneio_geracoes')
    .select('escala_storage_path, romaneio_storage_path, pao_storage_path')
    .eq('cliente', CLIENTE).eq('data_referencia', data).not('romaneio_storage_path', 'is', null)
    .order('gerado_em', { ascending: false }).limit(1).maybeSingle()
  if (error) throw new Error(`geracao do dia: ${error.message}`)
  if (!g) return null
  return { escala: g.escala_storage_path as string | null, romaneio: g.romaneio_storage_path as string, pao: g.pao_storage_path as string | null }
}

async function baixarPdf(path: string): Promise<Buffer> {
  const { data, error } = await createServiceClient().storage.from(BUCKET).download(path)
  if (error || !data) throw new Error(`download ${path}: ${error?.message}`)
  return Buffer.from(await data.arrayBuffer())
}

async function linhasNoMonitoramento(data: string): Promise<number | null> {
  const chave = process.env.MOTOR_SECRET
  if (!chave) return null
  const base = process.env.MONITORAMENTO_URL ?? 'http://127.0.0.1:3010'
  try {
    const r = await fetch(`${base}/api/romaneio/contagem?data=${encodeURIComponent(data)}`, {
      headers: { 'x-motor-key': chave }, signal: AbortSignal.timeout(15_000),
    })
    if (!r.ok) return null
    const j = (await r.json()) as { linhas?: unknown }
    return typeof j.linhas === 'number' ? j.linhas : null
  } catch {
    return null
  }
}

export const depsReaisReparo: DepsReparo = {
  async aoVivoTemDia(data) {
    const { data: d, error } = await createServiceClient().from('kpi_ao_vivo_dia').select('data').eq('cliente', CLIENTE).eq('data', data).maybeSingle()
    if (error) throw new Error(`ao vivo do dia: ${error.message}`)
    return !!d
  },
  async geracaoTemDia(data) {
    return !!(await caminhosDaGeracao(data))
  },
  linhasNoMonitoramento,
  jaTentouReenvio: data => existsSync(join(tmpdir(), `kpi-reparo-monitoramento-${data}.flag`)),
  marcarTentativaReenvio: data => { try { writeFileSync(join(tmpdir(), `kpi-reparo-monitoramento-${data}.flag`), new Date().toISOString()) } catch { /* sem trava, so' perde a protecao */ } },
  async aoVivoEnviadoPorPessoa(data) {
    const { data: d } = await createServiceClient().from('kpi_ao_vivo_dia').select('enviado_por').eq('cliente', CLIENTE).eq('data', data).maybeSingle()
    return typeof d?.enviado_por === 'string' && d.enviado_por.includes('@')
  },
  async preencherAoVivo(data) {
    const e = await entradaDaGeracao(data, CLIENTE)
    if (!e || e.romaneio.length === 0) throw new Error('geracao sem linhas de romaneio')
    await guardarDiaAoVivo({
      cliente: CLIENTE, data, escala: e.escala, romaneio: e.romaneio, pao: e.pao,
      escalaEnviada: e.escalaEnviada, paoEnviado: e.paoEnviado, enviadoPor: 'reparo-automatico',
    })
  },
  async reenviarAoMonitoramento(data) {
    const c = await caminhosDaGeracao(data)
    if (!c) return { ok: false, erro: 'geracao sem PDFs' }
    const arquivos: ArquivoMonitoramento[] = [{ buf: await baixarPdf(c.romaneio), nome: 'romaneio.pdf', origem: 'romaneio' }]
    if (c.pao) arquivos.push({ buf: await baixarPdf(c.pao), nome: 'pao.pdf', origem: 'escala_pao' })
    const r = await enviarAoMonitoramento(arquivos, 'reparo-automatico')
    const falha = r.find(x => !x.ok)
    return falha ? { ok: false, erro: `${falha.origem}: ${falha.erro}` } : { ok: true }
  },
}
