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
import { CLIENTES_AO_VIVO, calcularAoVivo, guardarDiaAoVivo, fonteDoDiaAoVivo } from '../src/lib/kpi-romaneio/ao-vivo-servico'
import { buscarDiaRioQualityFusion } from '../src/lib/kpi-rioquality/fonte-fusion'
import { linhasComCoordenadasRQ, enviarRioQualityAoMonitoramento } from '../src/lib/kpi-rioquality/enviar-monitoramento-rq'
import { diaAnterior, precisaFecharDia, precisaReconferirTerritorio } from '../src/lib/kpi-romaneio/ao-vivo'
import { limparCacheDia } from '../src/lib/kpi-romaneio/cache-dia'
import { repararDia, depsReaisReparo, repararDiaRQ, depsReaisReparoRQ } from '../src/lib/kpi-romaneio/reparar-dia'
import { sincronizarAcessosMonitoramento } from '../src/lib/acessos-monitoramento'
import { registrarSyncFusion, lerStatusFusion, gravarStatusFusion } from '../src/lib/kpi-rioquality/status-fusion-banco'
import { decidirAlertaFusion, marcarAlertaFusion, type StatusFusion } from '../src/lib/kpi-rioquality/status-fusion'
import { execFile } from 'node:child_process'

const log = (m: string) => console.log(`${new Date().toISOString()} ${m}`)
const horaBRAgora = () => Number(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false })) % 24

// Puxa o dia da Fusion e grava no Ao vivo. Nunca lanca (fail-open): o tick segue pro calculo.
// F2-05 (KRQ-05): toda tentativa fica registrada (status-fusion-banco.ts),
// inclusive o dia manual -- a tela mostra o banner e o tick decide o alerta.
export async function sincronizarFusionRioQuality(data: string): Promise<'ok' | 'sem_dados' | 'manual' | 'erro'> {
  let erro: string | null = null
  const s = await tentarFusionRioQuality(data).catch(e => { erro = String(e); log(`Fusion RQ ${data}: ${erro}`); return 'erro' as const })
  await registrarSyncFusion(data, { situacao: s, em: new Date().toISOString(), erro })
  return s
}

async function tentarFusionRioQuality(data: string): Promise<'ok' | 'sem_dados' | 'manual'> {
  // Auditoria 20/10 (RQ-10): romaneio subido a mao (planilha com bairro e NF
  // real) vale mais que o da Fusion (sem bairro) -- nao sobrescreve.
  if ((await fonteDoDiaAoVivo('rioquality', data)) === 'manual') return 'manual'
  const linhas = await buscarDiaRioQualityFusion(data)
  if (linhas.length === 0) return 'sem_dados'
  await guardarDiaAoVivo({
    cliente: 'rioquality', data, escala: [], romaneio: linhas,
    pao: { linhas: [], escala: [] }, escalaEnviada: false, paoEnviado: false,
    enviadoPor: 'cron-fusion', fonte: 'fusion',
  })
  // Ponte pro Monitoramento: os carros da RQ aparecem no mapa (modo Romaneio)
  // com a data do dia fixa. Fail-open -- não derruba a sincronização.
  // F2-04: substitui o dia da RQ no mapa (modo do envio), com a coordenada do KPI.
  const mon = await enviarRioQualityAoMonitoramento(data, await linhasComCoordenadasRQ(linhas), { enviadoPor: 'cron-fusion' })
  if (!mon.ok) log(`monitoramento RQ ${data}: erro ${mon.erro}`)
  return 'ok'
}

/** F2-05: o alerta interno sai so' com KPI_ALERTA_FUSION_DM=1 (desligado por
 *  padrao; o dono liga quando quiser). Vai so' ao dono, nunca a cliente. */
export const alertaFusionLigado = (env: Record<string, string | undefined> = process.env) => env.KPI_ALERTA_FUSION_DM === '1'

/** Mesmo canal dos outros alertas do servidor (alertar-dm.mjs do
 *  monitoramento: DM so' ao dono, no maximo 1 por chave a cada 6 h). */
function enviarAlertaDm(chave: string, texto: string): Promise<void> {
  const script = process.env.KPI_ALERTAR_DM_SCRIPT ?? '/srv/transmonseg/definitivo/scripts/alertar-dm.mjs'
  return new Promise(resolve => {
    execFile('node', [script, chave, texto], { timeout: 60_000 }, (err, out, errOut) => {
      if (err) log(`alerta ${chave}: falhou (${err.message}) ${String(errOut).slice(0, 200)}`)
      else log(String(out).trim() || `alerta ${chave}: enviado`)
      resolve()
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
    const r = await calcularAoVivo(cliente, ontem, log)
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
    const r = await calcularAoVivo(cliente, ontem, log)
    log(`ao vivo ${cliente} ${ontem} (reconferencia de territorio): ${r}`)
  }
}

async function main() {
  // Logins separados (06/10): o monitoramento segue os perfis do KPI.
  const acessos = await sincronizarAcessosMonitoramento().catch(err => `erro: ${err}`)
  if (acessos !== 'sem mudança') log(`acessos monitoramento: ${acessos}`)
  await fecharDiaAnterior()
  await reconferirTerritorioDiaAnterior().catch(err => log(`reconferencia de territorio: ${err}`))
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
  }
}

if (!process.env.VITEST) {
  main().catch(err => {
    console.error(`${new Date().toISOString()} ERRO FATAL`, err)
    process.exit(1)
  })
}
