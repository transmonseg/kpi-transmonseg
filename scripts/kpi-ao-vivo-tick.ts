// Cálculo do KPI ao vivo em segundo plano (spec 2026-10-06-kpi-ao-vivo-design.md).
// Cron a cada 10 min; só calcula das 05h às 21h (BRT) e só se o romaneio do
// dia foi subido. A trava no banco (calcularAoVivo) impede dois cálculos ao
// mesmo tempo, inclusive com o disparado pela tela ao subir o romaneio.
// Reparo do dia (10/10): ver src/lib/kpi-romaneio/reparar-dia.ts.
// Fechamento (05/10): depois da meia-noite, o dia anterior ganha um último
// cálculo já com o dia encerrado -- sem isso as NFs que estavam "aguardando
// fim da rota" no último cálculo do dia ficavam pendentes pra sempre.
// Uso: npx tsx --env-file=.env.production scripts/kpi-ao-vivo-tick.ts
import { hojeBR } from '../src/lib/data-br'
import { createServiceClient } from '../src/lib/supabase/service'
import { CLIENTES_AO_VIVO, calcularAoVivo, guardarDiaAoVivo, fonteDoDiaAoVivo, entradaRioQualityDoDia } from '../src/lib/kpi-romaneio/ao-vivo-servico'
import { buscarDiaRioQualityFusionCompleto } from '../src/lib/kpi-rioquality/fonte-fusion'
import { romaneiosQueEncolheram, decidirEncolhimentoFusion, lerEstadoEncolhimentoFusion, gravarEstadoEncolhimentoFusion } from '../src/lib/kpi-rioquality/encolhimento-fusion'
import { linhasComCoordenadasRQ, enviarRioQualityAoMonitoramento, resumoEnvioRQ } from '../src/lib/kpi-rioquality/enviar-monitoramento-rq'
import { diaAnterior, precisaFecharDia, precisaReconferirTerritorio } from '../src/lib/kpi-romaneio/ao-vivo'
import { precisaRepetirFechamentoProvisorio } from '../src/lib/kpi-romaneio/publicacao'
import { limparCacheDia } from '../src/lib/kpi-romaneio/cache-dia'
import { repararDia, depsReaisReparo, repararDiaRQ, depsReaisReparoRQ } from '../src/lib/kpi-romaneio/reparar-dia'
import { sincronizarAcessosMonitoramento } from '../src/lib/acessos-monitoramento'
import { registrarSyncFusion, lerStatusFusion, gravarStatusFusion } from '../src/lib/kpi-rioquality/status-fusion-banco'
import { decidirAlertaFusion, marcarAlertaFusion, type StatusFusion } from '../src/lib/kpi-rioquality/status-fusion'
import { avisarRomaneioAusente, depsReaisAvisoRomaneio } from '../src/lib/kpi-romaneio/manha-servico'
import { entregasParaPresenca, enviarPresencaAoMonitoramento } from '../src/lib/kpi-romaneio/presenca-monitoramento'
import { comConferencias } from '../src/lib/kpi-romaneio/ao-vivo-conferencia-servidor'
import type { ResultadoAoVivo } from '../src/lib/kpi-romaneio/ao-vivo-servico'
import { execFile } from 'node:child_process'

const log = (m: string) => console.log(`${new Date().toISOString()} ${m}`)
const horaBRAgora = () => Number(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false })) % 24

// Puxa o dia da Fusion e grava no Ao vivo. Nunca lanca (fail-open): o tick segue pro calculo.
// F2-05 (KRQ-05): toda tentativa fica registrada (status-fusion-banco.ts),
// inclusive o dia manual -- a tela mostra o banner e o tick decide o alerta.
export async function sincronizarFusionRioQuality(data: string): Promise<'ok' | 'sem_dados' | 'manual' | 'erro'> {
  let erro: string | null = null
  const r = await tentarFusionRioQuality(data).catch(e => { erro = String(e); log(`Fusion RQ ${data}: ${erro}`); return { situacao: 'erro' as const, aviso: null } })
  await registrarSyncFusion(data, { situacao: r.situacao, em: new Date().toISOString(), erro, ...(r.situacao === 'ok' || r.situacao === 'sem_dados' ? { aviso: r.aviso } : {}) })
  return r.situacao
}

async function tentarFusionRioQuality(data: string): Promise<{ situacao: 'ok' | 'sem_dados' | 'manual'; aviso: string | null }> {
  // Auditoria 20/10 (RQ-10): romaneio subido a mao (planilha com bairro e NF
  // real) vale mais que o da Fusion -- nao sobrescreve.
  const fonte = await fonteDoDiaAoVivo('rioquality', data)
  if (fonte === 'manual') return { situacao: 'manual', aviso: null }
  // F4-09 (KRQ-02): relatorio de 55 colunas (NF real, bairro, codigo do
  // cliente) e a grade sem bairro so' de reserva -- nunca por cima de um dia
  // que ja' tem a versao de 55 colunas (ai' a falha vira 'erro' e o dia fica).
  const dia = await buscarDiaRioQualityFusionCompleto(data, { gradeComoReserva: fonte !== 'fusion55' })
  const linhas = dia.linhas
  if (dia.aviso) log(`Fusion RQ ${data}: ${dia.aviso}`)
  if (linhas.length === 0) return { situacao: 'sem_dados', aviso: dia.aviso }
  // Revisao F2-REV-02: o envio abaixo substitui o dia no mapa. Romaneio que
  // voltou com menos NFs que o dia guardado (resposta anomala da Fusion)
  // apagava os pontos dele com a presenca; agora recusa ate' a mesma leitura
  // se repetir 3 vezes seguidas (cancelamento de verdade). F4-09: compara
  // pelo pedido, que e' o mesmo na grade e no relatorio de 55 colunas.
  if (fonte === 'fusion' || fonte === 'fusion55') {
    const guardado = (await entradaRioQualityDoDia(data)) ?? []
    const d = decidirEncolhimentoFusion(romaneiosQueEncolheram(guardado, linhas), lerEstadoEncolhimentoFusion(data))
    gravarEstadoEncolhimentoFusion(data, d.estado)
    if (!d.aceitar) throw new Error(d.mensagem ?? 'Fusion: dia encolheu')
    if (d.mensagem) log(`Fusion RQ ${data}: ${d.mensagem}`)
  }
  await guardarDiaAoVivo({
    cliente: 'rioquality', data, escala: [], romaneio: linhas,
    pao: { linhas: [], escala: [] }, escalaEnviada: false, paoEnviado: false,
    enviadoPor: 'cron-fusion', fonte: dia.fonte,
  })
  // Ponte pro Monitoramento: os carros da RQ aparecem no mapa (modo Romaneio)
  // com a data do dia fixa. Fail-open -- não derruba a sincronização.
  // F2-04: substitui o dia da RQ no mapa (modo do envio), com a coordenada do KPI.
  // F4-09: com 55 colunas vai a NF real + pedido, como o upload manual.
  const mon = await enviarRioQualityAoMonitoramento(data, await linhasComCoordenadasRQ(linhas), { enviadoPor: 'cron-fusion' })
  // Revisao F2-04-a: linhas apagadas e substituicao recusada tambem vao pro log.
  const resumo = resumoEnvioRQ(data, mon)
  if (resumo) log(resumo)
  return { situacao: 'ok', aviso: dia.aviso }
}

/** F2-05: o alerta interno sai so' com KPI_ALERTA_FUSION_DM=1 (desligado por
 *  padrao; o dono liga quando quiser). Vai so' ao dono, nunca a cliente. */
export const alertaFusionLigado = (env: Record<string, string | undefined> = process.env) => env.KPI_ALERTA_FUSION_DM === '1'

/** Mesmo canal dos outros alertas do servidor (alertar-dm.mjs do
 *  monitoramento: DM so' ao dono, no maximo 1 por chave a cada 6 h).
 *  Revisao F3-07 (R5): devolve se a DM saiu -- o aviso de romaneio so'
 *  grava "enviado" com true e tenta de novo com false. O alertar-dm sai
 *  sempre com codigo 0 (nunca derruba o cron), inclusive quando o WhatsApp
 *  falha: sucesso = sem erro E stdout com "enviado" ("alerta X enviado" ou
 *  "ja' enviado nas ultimas 6 h"); a falha vai so' pro stderr. */
export function enviarAlertaDm(chave: string, texto: string): Promise<boolean> {
  const script = process.env.KPI_ALERTAR_DM_SCRIPT ?? '/srv/transmonseg/definitivo/scripts/alertar-dm.mjs'
  return new Promise(resolve => {
    execFile('node', [script, chave, texto], { timeout: 60_000 }, (err, out, errOut) => {
      const ok = !err && /enviado/.test(String(out))
      if (err) log(`alerta ${chave}: falhou (${err.message}) ${String(errOut).slice(0, 200)}`)
      else if (!ok) log(`alerta ${chave}: falhou ${String(errOut).trim().slice(0, 200) || '(sem confirmação do alertar-dm)'}`)
      else log(String(out).trim())
      resolve(ok)
    })
  })
}

type DepsAlertaFusion = {
  ler: (data: string) => Promise<StatusFusion | null>
  gravar: (data: string, s: StatusFusion) => Promise<boolean>
  enviar: (chave: string, texto: string) => Promise<void>
  agoraMs: number
  ligado: boolean
  log: (m: string) => void
}

/** 60 min sem a Fusion responder entre 05h e 21h BRT: prepara o alerta ao
 *  dono, uma vez por queda. Desligado: so' registra no log. */
export async function alertarFusionSeParada(data: string, deps: DepsAlertaFusion = {
  ler: d => lerStatusFusion(d), gravar: (d, st) => gravarStatusFusion(d, st), enviar: enviarAlertaDm,
  agoraMs: Date.now(), ligado: alertaFusionLigado(), log,
}): Promise<'nada' | 'desligado' | 'enviado'> {
  const status = await deps.ler(data)
  const texto = decidirAlertaFusion(status, deps.agoraMs)
  if (!status || !texto) return 'nada'
  await deps.gravar(data, marcarAlertaFusion(status, new Date(deps.agoraMs).toISOString()))
  if (!deps.ligado) {
    deps.log(`alerta Fusion preparado, envio desligado (KPI_ALERTA_FUSION_DM): ${texto}`)
    return 'desligado'
  }
  await deps.enviar('fusion-rq', texto)
  return 'enviado'
}

export async function fecharDiaAnterior() {
  const ontem = diaAnterior(hojeBR())
  for (const cliente of CLIENTES_AO_VIVO) {
    const { data } = await createServiceClient().from('kpi_ao_vivo_calculo').select('calculado_em').eq('cliente', cliente).eq('data', ontem).maybeSingle()
    if (!precisaFecharDia((data?.calculado_em as string | null) ?? null, ontem, Date.now())) continue
    log(`ao vivo ${cliente} ${ontem}: fechamento do dia`)
    // RQ-09 (auditoria 20/10): a sync para as 21h (e falha com o tunel caido);
    // o calculo final usa o romaneio completo do dia. Respeita upload manual.
    if (cliente === 'rioquality') {
      const s = await sincronizarFusionRioQuality(ontem)
      log(`fusion rioquality ${ontem} (fechamento): ${s}`)
      // Revisao final 23/10: com o tunel caido, fechar agora gravava
      // calculado_em e o dia nunca mais era refeito com o romaneio completo.
      // Ate' as 06h BRT espera o proximo tick; depois fecha com o que tem.
      if (s === 'erro' && horaBRAgora() < 6) { log(`ao vivo ${cliente} ${ontem}: fechamento adiado (Fusion fora)`); continue }
    }
    // F3-R10: so' o fechamento (e a reconferencia abaixo) publica no Dashboard.
    const r = await calcularAoVivo(cliente, ontem, log, { publicarFechamento: true })
    if (r !== 'ok') log(`ao vivo ${cliente} ${ontem} (fechamento): ${r}`)
  }
}

// F1-11 (KN-08): fechamento das 00:30 sem a conferencia de territorio (ponte
// do monitoramento fora) -> o dia fechado e' refeito uma vez a partir das
// 05:30 BRT, decidido pelo estado gravado (nao por horario fixo do cron).
export async function reconferirTerritorioDiaAnterior() {
  const ontem = diaAnterior(hojeBR())
  for (const cliente of CLIENTES_AO_VIVO) {
    const { data } = await createServiceClient().from('kpi_ao_vivo_calculo').select('calculado_em, ultimo_erro, ultimo_erro_em').eq('cliente', cliente).eq('data', ontem).maybeSingle()
    const row = { calculado_em: (data?.calculado_em as string | null) ?? null, ultimo_erro: (data?.ultimo_erro as string | null) ?? null, ultimo_erro_em: (data?.ultimo_erro_em as string | null) ?? null }
    if (!precisaReconferirTerritorio(row, ontem, Date.now())) continue
    log(`ao vivo ${cliente} ${ontem}: fechamento saiu sem a conferencia de endereco -- refazendo`)
    const r = await calcularAoVivo(cliente, ontem, log, { publicarFechamento: true })
    log(`ao vivo ${cliente} ${ontem} (reconferencia de territorio): ${r}`)
  }
}

// KPI-05 (auditoria 03/11): fechamento que ficou provisorio (fonte
// incompleta, nao foi ao Dashboard) e' calculado de novo a cada tick ate'
// 12h BRT de D+1. Com o territorio tambem fora, a reconferencia das 05:30 cuida.
export async function repetirFechamentoProvisorioDiaAnterior() {
  const ontem = diaAnterior(hojeBR())
  for (const cliente of CLIENTES_AO_VIVO) {
    const { data } = await createServiceClient().from('kpi_ao_vivo_calculo').select('calculado_em, ultimo_erro, ultimo_erro_em').eq('cliente', cliente).eq('data', ontem).maybeSingle()
    const row = { calculado_em: (data?.calculado_em as string | null) ?? null, ultimo_erro: (data?.ultimo_erro as string | null) ?? null, ultimo_erro_em: (data?.ultimo_erro_em as string | null) ?? null }
    if (!precisaRepetirFechamentoProvisorio(row, ontem, Date.now())) continue
    if (precisaReconferirTerritorio(row, ontem, Date.now())) continue
    log(`ao vivo ${cliente} ${ontem}: fechamento provisório -- calculando de novo`)
    const r = await calcularAoVivo(cliente, ontem, log, { publicarFechamento: true })
    log(`ao vivo ${cliente} ${ontem} (fechamento provisório): ${r}`)
  }
}

// 07/11: notas entregues viram presenca no monitoramento (desvio da Central
// Romaneio para de contar cliente ja' atendido como pendente). Fail-open.
async function enviarPresencaDoDia(cliente: string, data: string) {
  const { data: linha } = await createServiceClient().from('kpi_ao_vivo_calculo').select('resultado').eq('cliente', cliente).eq('data', data).maybeSingle()
  // 09/11: nota confirmada pela operação também vira presença.
  const resultado = await comConferencias(cliente as 'nutrimax' | 'rioquality', data, (linha?.resultado as ResultadoAoVivo | null) ?? null)
  const entregas = entregasParaPresenca(resultado)
  const r = await enviarPresencaAoMonitoramento(data, entregas)
  if (!r.ok) log(`presenca monitoramento ${cliente} ${data}: ${r.erro}`)
  else if (r.gravadas) log(`presenca monitoramento ${cliente} ${data}: ${r.gravadas} nota(s) novas de ${entregas.length}`)
}

async function main() {
  // Logins separados (06/10): o monitoramento segue os perfis do KPI.
  const acessos = await sincronizarAcessosMonitoramento().catch(err => `erro: ${err}`)
  if (acessos !== 'sem mudança') log(`acessos monitoramento: ${acessos}`)
  await fecharDiaAnterior()
  await reconferirTerritorioDiaAnterior().catch(err => log(`reconferencia de territorio: ${err}`))
  await repetirFechamentoProvisorioDiaAnterior().catch(err => log(`fechamento provisório: ${err}`))
  const horaBR = horaBRAgora()
  // Limpeza 1x por dia (04h BRT, 1o tick da hora): cache do dia e planilhas
  // do ao vivo ficam (F0-11, ver abaixo).
  if (horaBR === 4 && new Date().getMinutes() < 10) {
    await limparCacheDia(hojeBR()).catch(err => log(`limpeza cache: ${err}`))
    // Plano mestre 23/10 (F0-11): planilhas do Ao vivo NAO sao mais apagadas.
    // O F2-12 ja' guarda o KPI final em fechados/<cliente>/AAAA-MM-DD.xlsx,
    // mas limparXlsxAoVivo so' volta depois de o dono conferir em producao
    // que o arquivo de ontem existe e continua la' 8 dias depois.
    log('limpeza diaria feita')
  }
  if (horaBR < 5 || horaBR >= 21) return
  const data = hojeBR()
  // Reparo (10/10): preenche o Ao vivo a partir da geracao do dia e reenvia o
  // romaneio ao monitoramento se ele estiver sem. Nunca lanca (fail-open).
  await repararDia(depsReaisReparo, data, log)
  for (const cliente of CLIENTES_AO_VIVO) {
    if (cliente === 'rioquality') {
      const s = await sincronizarFusionRioQuality(data)
      if (s !== 'ok' && s !== 'manual') log(`fusion rioquality ${data}: ${s}`)
      await alertarFusionSeParada(data).catch(err => log(`alerta Fusion: ${err}`))
      // F2-04: dia manual (o tick nao puxa a Fusion) ou envio que falhou --
      // o monitoramento com outra contagem recebe o dia guardado de novo.
      await repararDiaRQ(depsReaisReparoRQ, data, log)
    }
    const r = await calcularAoVivo(cliente, data, log)
    if (r !== 'ok') log(`ao vivo ${cliente} ${data}: ${r}`)
    await enviarPresencaDoDia(cliente, data).catch(err => log(`presenca monitoramento ${cliente}: ${err}`))
  }
  // F3-07 (ACH-04): 06:30 e 07:30 BRT, decidido pelo estado gravado (o tick
  // que passar primeiro do marco avalia). Depois da sync da Fusion acima.
  // Interno: banner no Ao vivo + DM ao dono (KPI_AVISO_ROMANEIO_DM=1; desligada).
  await avisarRomaneioAusente(data, depsReaisAvisoRomaneio([...CLIENTES_AO_VIVO], enviarAlertaDm, log))
    .catch(err => log(`aviso de romaneio ausente: ${err}`))
}

if (!process.env.VITEST) {
  main().catch(err => {
    console.error(`${new Date().toISOString()} ERRO FATAL`, err)
    process.exit(1)
  })
}
