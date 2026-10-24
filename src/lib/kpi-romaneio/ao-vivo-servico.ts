import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import { sugerirTrocas, placasDoCarroPorCarga, type SugestaoTroca, type TrocaConfirmada } from './sugerir-trocas'
import { EMPRESA_NUTRIMAX } from './constants'
// KPI ao vivo: leitura/gravação no banco e o cálculo. O cálculo é a MESMA
// função da geração normal (gerarKpiNutrimax); a tela lê só o resultado
// gravado aqui, nunca recalcula por conta própria.
import { createServiceClient } from '@/lib/supabase/service'
import { gerarKpiNutrimax, type EntradaKpiNutrimax } from './gerar-nutrimax'
import { extrairKpiCompleto } from './resumo-dashboard'
import { resumirPlacas, contarCorretas, paradaDaChegada, paradaEmAndamento, nfProxima, AVISO_TERRITORIO_AO_VIVO, type PlacaAoVivo } from './ao-vivo'
import { investigarPlacas, alarmeSemCoordenada } from './investigacao'
import { normPlaca } from '@/lib/unitrac-api'
import type { LinhaEscala, LinhaRomaneio } from './types'
import { gerarKpiRioQuality } from '@/lib/kpi-rioquality/pipeline'
import { buscarFrotaRioQuality } from '@/lib/kpi-rioquality/frota'
import { placasForaDoCadastro, avisoPlacasForaDoCadastro } from '@/lib/kpi-rioquality/frota-aviso'
import { foraDoAlcanceApi } from './constants'
import { lerSnapshotParadas } from './paradas-snapshot'
import { EMPRESA_SNAPSHOT_RIOQUALITY } from '@/lib/kpi-rioquality/snapshot-paradas'
import { hojeBR } from '@/lib/data-br'
import { versaoDasRegras } from './versao-regras'
import { NOME_FONTE } from './gerador-xlsx'
import type { EntregaRioQualityCompleta } from '@/lib/kpi-rioquality/parse-planilhas'

export const CLIENTES_AO_VIVO = ['nutrimax', 'rioquality'] as const
export const NOME_CLIENTE_AO_VIVO: Record<ClienteAoVivo, string> = { nutrimax: 'Nutry Max', rioquality: 'Rio Quality' }
export type ClienteAoVivo = (typeof CLIENTES_AO_VIVO)[number]
export const clienteAoVivoValido = (c: string | null): c is ClienteAoVivo => (CLIENTES_AO_VIVO as readonly string[]).includes(c ?? '')

/** Planilha do último cálculo (uma por cliente/dia, sobrescrita a cada 10
 *  min): "Gerar KPI agora" devolve ela na hora. A limpeza de 7 dias está
 *  suspensa desde o F0-11. */
const BUCKET_AO_VIVO = 'kpi-romaneio-inputs'
export const caminhoXlsxAoVivo = (cliente: ClienteAoVivo, data: string) => `ao-vivo/${cliente}/${data}.xlsx`
/** F2-12 (KRQ-06): planilha final do dia encerrado, guardada para sempre,
 *  fora da pasta que a limpeza do Ao vivo apaga. */
export const caminhoXlsxFechado = (cliente: ClienteAoVivo, data: string) => `fechados/${cliente}/${data}.xlsx`

async function guardarXlsxFechado(svc: ReturnType<typeof createServiceClient>, cliente: ClienteAoVivo, data: string, xlsx: Buffer, log: (m: string) => void): Promise<void> {
  const up = await svc.storage.from(BUCKET_AO_VIVO).upload(caminhoXlsxFechado(cliente, data), xlsx, {
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', upsert: true,
  })
  if (up.error) log(`ao vivo ${cliente} ${data}: planilha final não guardada em fechados/ (${up.error.message})`)
}
const XLSX_AO_VIVO_VALIDO_MS = 10 * 60_000

/** Planilha do último cálculo se ele tem menos de 10 min; senão null. */
export async function xlsxRecenteAoVivo(cliente: ClienteAoVivo, data: string): Promise<{ xlsx: Buffer; calculadoEm: string } | null> {
  const svc = createServiceClient()
  const { data: c } = await svc.from('kpi_ao_vivo_calculo').select('calculado_em').eq('cliente', cliente).eq('data', data).maybeSingle()
  const em = c?.calculado_em as string | undefined
  if (!em || Date.now() - Date.parse(em) > XLSX_AO_VIVO_VALIDO_MS) return null
  const { data: arq, error } = await svc.storage.from(BUCKET_AO_VIVO).download(caminhoXlsxAoVivo(cliente, data))
  if (error || !arq) return null
  return { xlsx: Buffer.from(await arq.arrayBuffer()), calculadoEm: em }
}

/** Apaga planilhas do ao vivo com mais de 7 dias. */
export async function limparXlsxAoVivo(hoje: string): Promise<void> {
  const svc = createServiceClient()
  const d = new Date(`${hoje}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 7)
  const limite = d.toISOString().slice(0, 10)
  for (const cliente of CLIENTES_AO_VIVO) {
    const { data: arqs } = await svc.storage.from(BUCKET_AO_VIVO).list(`ao-vivo/${cliente}`, { limit: 1000 })
    const velhos = (arqs ?? []).filter(a => a.name.slice(0, 10) < limite).map(a => `ao-vivo/${cliente}/${a.name}`)
    if (velhos.length) await svc.storage.from(BUCKET_AO_VIVO).remove(velhos)
  }
}

/** Cálculo travado há mais que isso é considerado morto (processo caiu). */
const TRAVA_EXPIRA_MIN = 15

export type ResultadoAoVivo = {
  calculadoEm: string
  resumo: { taxa: number | null; entregues: number | null; nfsNaConta: number | null; aguardando: number; totalNfs: number; feitas: number; pct: number }
  placas: PlacaAoVivo[]
  /** Carro trocado sem aviso (06/10): sugestões pra operação confirmar. */
  sugestoesTroca?: SugestaoTroca[]
  /** F1-11: avisos do cálculo que não mudam a taxa (ex.: conferência de endereço indisponível). */
  avisos?: string[]
  /** F2-13 (KRQ-12): commit das regras com que o dia foi calculado (versao-regras.ts). */
  versaoRegras?: string | null
  /** F2-14 (RQ-08): calculo publicado incompleto (ponte de coerencia fora e
   *  sem resultado bom do dia pra manter). O proximo calculo bom substitui. */
  degradado?: string
}

export type DiaAoVivo = {
  enviadoEm: string
  enviadoPor: string | null
  /** 'manual' (subido na tela) ou 'fusion' (F2-05: banner do dia travado no envio manual). */
  fonte?: string | null
  nfs: number
  placas: number
  escalaEnviada: boolean
  paoEnviado: boolean
}

export type EstadoAoVivo = {
  dia: DiaAoVivo | null
  resultado: ResultadoAoVivo | null
  calculando: boolean
  ultimoErro: { mensagem: string; em: string } | null
}

/** Fonte do romaneio gravado do dia ('manual', 'fusion'...) ou null se nao ha'. */
export async function fonteDoDiaAoVivo(cliente: ClienteAoVivo, data: string): Promise<string | null> {
  const { data: row, error } = await createServiceClient().from('kpi_ao_vivo_dia').select('fonte').eq('cliente', cliente).eq('data', data).maybeSingle()
  if (error) throw new Error(`leitura do dia ao vivo falhou: ${error.message}`)
  return (row?.fonte as string | undefined) ?? null
}

export async function guardarDiaAoVivo(p: {
  cliente: ClienteAoVivo
  data: string
  escala: LinhaEscala[]
  /** Nutry Max: LinhaRomaneio[] lido dos PDFs. Rio Quality: as entregas lidas
   *  do Relatório de Entregas (EntregaRioQualityCompleta[]). */
  romaneio: LinhaRomaneio[] | EntregaRioQualityCompleta[]
  pao: { linhas: LinhaRomaneio[]; escala: LinhaEscala[] }
  escalaEnviada: boolean
  paoEnviado: boolean
  enviadoPor: string | null
  fonte?: 'manual' | 'fusion'
}): Promise<void> {
  const { error } = await createServiceClient().from('kpi_ao_vivo_dia').upsert({
    cliente: p.cliente, data: p.data, romaneio: p.romaneio, escala: p.escala, pao: p.pao,
    escala_enviada: p.escalaEnviada, pao_enviado: p.paoEnviado, enviado_por: p.enviadoPor, enviado_em: new Date().toISOString(),
    fonte: p.fonte ?? 'manual',
  }, { onConflict: 'cliente,data' })
  if (error) throw new Error(`guardar romaneio do dia: ${error.message}`)
}

export async function lerEstadoAoVivo(cliente: ClienteAoVivo, data: string): Promise<EstadoAoVivo> {
  const svc = createServiceClient()
  const [d, c] = await Promise.all([
    svc.from('kpi_ao_vivo_dia').select('romaneio, pao, escala_enviada, pao_enviado, enviado_por, enviado_em, fonte').eq('cliente', cliente).eq('data', data).maybeSingle(),
    svc.from('kpi_ao_vivo_calculo').select('resultado, ultimo_erro, ultimo_erro_em, rodando_desde').eq('cliente', cliente).eq('data', data).maybeSingle(),
  ])
  if (d.error) throw new Error(d.error.message)
  if (c.error) throw new Error(c.error.message)
  let dia: DiaAoVivo | null = null
  if (d.data) {
    const linhas: { placa?: string; placaNorm?: string }[] = [...(d.data.romaneio as { placa?: string; placaNorm?: string }[]), ...((d.data.pao as { linhas: LinhaRomaneio[] }).linhas ?? [])]
    dia = {
      enviadoEm: d.data.enviado_em as string,
      enviadoPor: (d.data.enviado_por as string | null) ?? null,
      fonte: (d.data.fonte as string | null | undefined) ?? null,
      nfs: linhas.length,
      placas: new Set(linhas.map(l => l.placa ?? l.placaNorm)).size,
      escalaEnviada: !!d.data.escala_enviada,
      paoEnviado: !!d.data.pao_enviado,
    }
  }
  const rodando = c.data?.rodando_desde as string | null | undefined
  return {
    dia,
    resultado: (c.data?.resultado as ResultadoAoVivo | null) ?? null,
    calculando: !!rodando && Date.now() - Date.parse(rodando) < TRAVA_EXPIRA_MIN * 60_000,
    ultimoErro: c.data?.ultimo_erro ? { mensagem: c.data.ultimo_erro as string, em: c.data.ultimo_erro_em as string } : null,
  }
}

/** Trava entre processos (servidor e cron): só um cálculo por cliente/dia. */
async function travar(cliente: ClienteAoVivo, data: string): Promise<boolean> {
  const svc = createServiceClient()
  await svc.from('kpi_ao_vivo_calculo').upsert({ cliente, data }, { onConflict: 'cliente,data', ignoreDuplicates: true })
  const limite = new Date(Date.now() - TRAVA_EXPIRA_MIN * 60_000).toISOString()
  const { data: linhas, error } = await svc.from('kpi_ao_vivo_calculo')
    .update({ rodando_desde: new Date().toISOString() })
    .eq('cliente', cliente).eq('data', data)
    .or(`rodando_desde.is.null,rodando_desde.lt.${limite}`)
    .select('cliente')
  if (error) throw new Error(`trava do calculo: ${error.message}`)
  return (linhas ?? []).length > 0
}

export async function entradaDoDia(cliente: ClienteAoVivo, data: string): Promise<EntradaKpiNutrimax | null> {
  const { data: d, error } = await createServiceClient().from('kpi_ao_vivo_dia')
    .select('romaneio, escala, pao, escala_enviada, pao_enviado').eq('cliente', cliente).eq('data', data).maybeSingle()
  if (error) throw new Error(error.message)
  if (!d) return null
  return {
    data,
    romaneio: d.romaneio as LinhaRomaneio[],
    escala: d.escala as LinhaEscala[],
    pao: d.pao as { linhas: LinhaRomaneio[]; escala: LinhaEscala[] },
    escalaEnviada: !!d.escala_enviada,
    paoEnviado: !!d.pao_enviado,
  }
}

/** Rio Quality: as entregas lidas de manhã (Relatório de Entregas). */
export async function entradaRioQualityDoDia(data: string): Promise<EntregaRioQualityCompleta[] | null> {
  const { data: d, error } = await createServiceClient().from('kpi_ao_vivo_dia').select('romaneio').eq('cliente', 'rioquality').eq('data', data).maybeSingle()
  if (error) throw new Error(error.message)
  return d ? (d.romaneio as EntregaRioQualityCompleta[]) : null
}

/** KPI do dia com o que foi guardado de manhã (mesma geração da tela
 *  "Gerar KPI" de cada cliente). null = romaneio do dia não subido. */
export async function gerarKpiDoDia(cliente: ClienteAoVivo, data: string, log: (m: string) => void = () => {},
  aoMontarDetalheNutry?: Parameters<typeof gerarKpiNutrimax>[1],
  // F2-03 (GEO-22, KRQ-04): a RQ entrega o mesmo que a Nutry (ponto do
  // cliente, detalhe, paradas, trajeto) -- antes so' as paradas.
  aoMontarDetalheRq?: Parameters<typeof gerarKpiRioQuality>[0]['aoMontarDetalhe']): Promise<{ xlsx: Buffer; qtdCargas: number; degradado?: string; aviso?: string; avisosFonte?: string[]; avisoFrota?: string } | null> {
  if (cliente === 'rioquality') {
    const entregas = await entradaRioQualityDoDia(data)
    if (!entregas) return null
    // Mesma regra da rota rioquality/gerar: dia fora das 48h da Unitrac usa o
    // snapshot noturno de paradas.
    let lerSnapshot: (() => Promise<Awaited<ReturnType<typeof lerSnapshotParadas>>>) | undefined
    if (foraDoAlcanceApi(data, hojeBR())) {
      const snap = await lerSnapshotParadas(EMPRESA_SNAPSHOT_RIOQUALITY, data)
      if (snap.size > 0) lerSnapshot = async () => snap
    }
    const cvPorPlaca = await buscarFrotaRioQuality()
    const r = await gerarKpiRioQuality({ entregasCompletas: entregas, data, cvPorPlaca, log, lerSnapshot, aoMontarDetalhe: aoMontarDetalheRq })
    // F2-15 (MON-12): placa real fora do cadastro conta como "sem rastreador"
    // (correta) -- aviso interno na tela; a taxa nao muda.
    const avisoFrota = avisoPlacasForaDoCadastro(placasForaDoCadastro(entregas, cvPorPlaca))
    return {
      ...(avisoFrota ? { avisoFrota } : {}),
      xlsx: r.xlsx, qtdCargas: r.linhasKpi.length,
      ...(r.coerenciaFalhou > 0 ? { degradado: `ponte de coerência do monitoramento falhou em ${r.coerenciaFalhou} rua(s)` } : {}),
    }
  }
  const entrada = await entradaDoDia(cliente, data)
  if (!entrada) return null
  const r = await gerarKpiNutrimax(entrada, aoMontarDetalheNutry)
  // F2-14 (GN-06): leitura que falhou (resolucoes, sem rastreador, trocas,
  // locais) so' ia pra aba Avisos -- vai tambem pra tela. Territorio ja' tem
  // aviso proprio (F1-11) e marca a repeticao das 05:30; nao repete aqui.
  const fontes = [...new Set((r.avisos ?? []).filter(a => a.motivo === 'fonte_indisponivel' && a.fonte && a.fonte !== 'territorio').map(a => a.fonte!))]
  const avisosFonte = fontes.map(f => `Não consegui ler ${NOME_FONTE[f]} neste cálculo — o resultado pode estar incompleto. O próximo cálculo tenta de novo.`)
  return {
    ...(avisosFonte.length > 0 ? { avisosFonte } : {}),
    xlsx: r.xlsx, qtdCargas: r.qtdCargasNutry,
    // F1-11 (KN-08): resultado vale (a taxa nao muda), mas sem os rotulos
    // "CORRIGIR CADASTRO" -- aviso na tela e marca pro tick repetir.
    ...(r.territorioIndisponivel ? { aviso: `${AVISO_TERRITORIO_AO_VIVO}: o monitoramento não respondeu à conferência de território; entregas em outro bairro/município podem estar sem "CORRIGIR CADASTRO" (a taxa não muda). O dia fechado é refeito às 05:30.` } : {}),
  }
}

/** Resultado da tela a partir da planilha do KPI lida (extrairKpiCompleto).
 *  Usado pelo cálculo ao vivo e pelo histórico (planilha guardada). */
export function montarResultadoAoVivo(data: string, lido: Awaited<ReturnType<typeof extrairKpiCompleto>>, coords: Map<string, { lat: number; lng: number }>, calculadoEm: string, paradas?: Map<string, { lat: number; lng: number }>): ResultadoAoVivo {
  const placas = resumirPlacas(data, lido.nfs, lido.resumo.cargas, coords, paradas)
  const totalNfs = placas.reduce((s, p) => s + p.total, 0)
  // F1-09: o mesmo número de entregues da taxa (entregue + sem rastreador).
  const feitas = contarCorretas(placas)
  return {
    calculadoEm,
    resumo: {
      taxa: lido.resumo.taxa, entregues: lido.resumo.entregues, nfsNaConta: lido.resumo.nfsNaConta,
      aguardando: lido.resumo.aguardando ?? 0, totalNfs, feitas, pct: totalNfs ? Math.round((100 * feitas) / totalNfs) : 0,
    },
    placas,
  }
}

const DIAS_HISTORICO_TROCA = 60
const DIAS_HISTORICO_CARRO = 14
const diasAntes = (data: string, n: number) => { const d = new Date(`${data}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10) }

/** F1-02/F1-03/F1-04: o que a operação já confirmou antes do dia (trocas de
 *  placa e as placas de cada carro do JAC no pão). Só leitura e fail-open:
 *  sem isso a sugestão sai só pelo GPS, como antes. */
export async function contextoSugestaoTroca(data: string, paoHoje: { carga: string; placa: string; numeroCarro?: string }[], log: (m: string) => void = () => {}):
  Promise<{ historico: TrocaConfirmada[]; porCarro: (frota: string[]) => Map<string, string[]> }> {
  const svc = createServiceClient()
  let historico: TrocaConfirmada[] = []
  let anteriores: { data: string; linhas: { carga: string; placa: string; numeroCarro?: string }[] }[] = []
  try {
    const { data: linhas, error } = await svc.from('kpi_troca_placa').select('data, carga, placa_escala, placa_real')
      .eq('empresa', EMPRESA_NUTRIMAX).lt('data', data).gte('data', diasAntes(data, DIAS_HISTORICO_TROCA)).order('data', { ascending: true })
    if (error) throw new Error(error.message)
    historico = (Array.isArray(linhas) ? linhas : []).map(l => ({ data: l.data as string, carga: (l.carga as string | null) ?? null, placaEscala: (l.placa_escala as string | null) ?? '', placaReal: l.placa_real as string }))
  } catch (err) { log(`sugestao de troca: historico indisponivel (${err instanceof Error ? err.message : String(err)})`) }
  if (paoHoje.some(l => l.numeroCarro)) {
    try {
      const { data: dias, error } = await svc.from('kpi_ao_vivo_dia').select('data, pao')
        .eq('cliente', 'nutrimax').lt('data', data).gte('data', diasAntes(data, DIAS_HISTORICO_CARRO))
      if (error) throw new Error(error.message)
      anteriores = (Array.isArray(dias) ? dias : []).map(d => ({ data: d.data as string, linhas: ((d.pao as { linhas?: LinhaRomaneio[] } | null)?.linhas) ?? [] }))
    } catch (err) { log(`sugestao de troca: pao dos dias anteriores indisponivel (${err instanceof Error ? err.message : String(err)})`) }
  }
  return { historico, porCarro: frota => placasDoCarroPorCarga(paoHoje, anteriores, historico, frota) }
}

/** Roda o KPI com o romaneio guardado e grava o resultado da tela.
 *  Outro cálculo rodando: não faz nada ('ocupado'). Sem romaneio: 'sem_romaneio'. */
export async function calcularAoVivo(cliente: ClienteAoVivo, data: string, log: (m: string) => void = () => {}): Promise<'ok' | 'ocupado' | 'sem_romaneio' | 'erro'> {
  const temDia = cliente === 'rioquality' ? await entradaRioQualityDoDia(data) : await entradaDoDia(cliente, data)
  if (!temDia) return 'sem_romaneio'
  if (!(await travar(cliente, data))) return 'ocupado'
  const svc = createServiceClient()
  const t0 = Date.now()
  try {
    const coords = new Map<string, { lat: number; lng: number }>()
    const paradasNf = new Map<string, { lat: number; lng: number }>()
    // Parada em andamento por placa (aviso de +1 h no cliente, 06/10).
    const paradaAtualPorPlaca = new Map<string, { inicio: string; lat: number | null; lng: number | null }>()
    let sugestoesTroca: SugestaoTroca[] = []
    // Paradas do dia por placa (investigação das não entregues, 06/10).
    let paradasDoDia = new Map<string, UnitracParadaRow[]>()
    let trajetoPorNf = new Map<string, number>()
    const ehHoje = data === hojeBR()
    const ctxTroca = cliente === 'nutrimax'
      ? await contextoSugestaoTroca(data, ((temDia as EntradaKpiNutrimax).pao?.linhas ?? []), log)
      : null
    // Ponto do cliente, parada da entrega e paradas do dia -- igual nos dois
    // clientes (F2-03: a RQ ficava sem ponto e toda investigacao "sem_coordenada").
    const registrarDetalhe = ({ romaneioGeo, detalhe, paradasPorPlaca, menorDistanciaTrajetoPorNf }: {
      romaneioGeo: { nf: string; lat: number | null; lng: number | null }[]
      detalhe: { nf: string; placa: string; chegada: string | null }[]
      paradasPorPlaca: Map<string, UnitracParadaRow[]>
      menorDistanciaTrajetoPorNf: Map<string, number>
    }) => {
      paradasDoDia = paradasPorPlaca
      trajetoPorNf = menorDistanciaTrajetoPorNf
      for (const l of romaneioGeo) if (l.lat != null && l.lng != null) coords.set(l.nf, { lat: l.lat, lng: l.lng })
      // Ponto da parada que o KPI contou como entrega ("Ver no monitoramento").
      for (const d of detalhe) {
        const p = paradaDaChegada(paradasPorPlaca.get(normPlaca(d.placa)) ?? [], d.chegada)
        if (p) paradasNf.set(d.nf, p)
      }
      // Parada em andamento por placa: aviso de +1 h no cliente (06/10, nos dois).
      if (ehHoje) for (const [placaNorm, ps] of paradasPorPlaca) {
        const pa = paradaEmAndamento(ps, Date.now())
        if (pa) paradaAtualPorPlaca.set(placaNorm, pa)
      }
    }
    const r = await gerarKpiDoDia(cliente, data, log, {
      aoMontarDetalhe: ({ romaneioGeo, detalhe, paradasPorPlaca, menorDistanciaTrajetoPorNf, frota }) => {
        registrarDetalhe({ romaneioGeo, detalhe, paradasPorPlaca, menorDistanciaTrajetoPorNf })
        // F1-03: tambem em dia fechado (antes so' hoje -- sumia depois das
        // 00:30); a "Placas do dia" le daqui. Sempre so' sugestao.
        const pontos = romaneioGeo.filter(l => l.lat != null && l.lng != null)
          .map(l => ({ carga: l.carga, placa: normPlaca(l.placa), endereco: l.endereco, lat: l.lat as number, lng: l.lng as number }))
        sugestoesTroca = sugerirTrocas(pontos, paradasPorPlaca, {
          frota, historico: ctxTroca?.historico ?? [], placasDoCarroPorCarga: ctxTroca?.porCarro(frota ?? []),
        })
        // D-03: a placa fora da frota leva a provavel no rotulo da planilha.
        return { sugestoesTroca }
      },
    }, registrarDetalhe)
    if (!r) throw new Error('romaneio do dia sumiu durante o cálculo')
    // RQ-08 (auditoria 20/10): cálculo degradado (ponte de coerência fora --
    // o corredor da rua some e 80-100 entregues caíam entre ticks) não
    // sobrescreve um resultado bom do dia; fica o anterior e o erro registrado.
    // F2-14 (RQ-08): so' o ultimo resultado BOM segura -- um anterior que ja'
    // saiu degradado da' lugar ao calculo mais novo (igualmente degradado).
    if (r.degradado) {
      const { data: atual } = await svc.from('kpi_ao_vivo_calculo').select('resultado').eq('cliente', cliente).eq('data', data).maybeSingle()
      const anterior = atual?.resultado as ResultadoAoVivo | null | undefined
      if (anterior && !anterior.degradado) {
        await svc.from('kpi_ao_vivo_calculo').update({ ultimo_erro: r.degradado, ultimo_erro_em: new Date().toISOString(), rodando_desde: null }).eq('cliente', cliente).eq('data', data)
        log(`ao vivo ${cliente} ${data}: resultado anterior mantido (${r.degradado})`)
        // F2-12: dia encerrado -- o final e' o resultado bom mantido, cuja
        // planilha e' a do Ao vivo.
        if (data < hojeBR()) {
          const { data: arq, error } = await svc.storage.from(BUCKET_AO_VIVO).download(caminhoXlsxAoVivo(cliente, data))
          if (error || !arq) log(`ao vivo ${cliente} ${data}: planilha do resultado mantido não lida (${error?.message ?? 'sem arquivo'})`)
          else await guardarXlsxFechado(svc, cliente, data, Buffer.from(await arq.arrayBuffer()), log)
        }
        return 'erro'
      }
    }
    // Planilha do cálculo guardada (sobrescreve a anterior do dia).
    const up = await svc.storage.from(BUCKET_AO_VIVO).upload(caminhoXlsxAoVivo(cliente, data), r.xlsx, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', upsert: true,
    })
    if (up.error) log(`ao vivo ${cliente} ${data}: planilha não guardada (${up.error.message})`)
    // F2-12 (KRQ-06): dia encerrado (fechamento das 00:30, reconferência das
    // 05:30 ou recálculo depois) -- a planilha final fica guardada para sempre.
    if (data < hojeBR()) await guardarXlsxFechado(svc, cliente, data, r.xlsx, log)
    const resultado = montarResultadoAoVivo(data, await extrairKpiCompleto(r.xlsx), coords, new Date().toISOString(), paradasNf)
    if (sugestoesTroca.length > 0) resultado.sugestoesTroca = sugestoesTroca
    if (r.aviso) resultado.avisos = [r.aviso]
    if (r.avisosFonte) resultado.avisos = [...(resultado.avisos ?? []), ...r.avisosFonte]
    if (r.avisoFrota) {
      resultado.avisos = [...(resultado.avisos ?? []), r.avisoFrota]
      log(`ao vivo ${cliente} ${data}: ${r.avisoFrota}`)
    }
    // F2-14 (RQ-08): degradado sem anterior bom sai marcado, com aviso na tela
    // e ultimo_erro (antes saia calado, como se a taxa estivesse completa).
    if (r.degradado) {
      resultado.degradado = r.degradado
      resultado.avisos = [...(resultado.avisos ?? []), `Cálculo incompleto: ${r.degradado}. Entregas confirmadas pela rua podem estar faltando; o próximo cálculo tenta de novo.`]
    }
    resultado.versaoRegras = versaoDasRegras()
    investigarPlacas(resultado.placas, paradasDoDia, trajetoPorNf)
    // F2-03: alarme de falha silenciosa -- nenhuma NF do cliente com ponto
    // (RQ de 20 a 23/10: 0 de 11.382, sem nenhum erro registrado).
    const alarmeCoord = alarmeSemCoordenada(resultado.placas)
    if (alarmeCoord) {
      resultado.avisos = [...(resultado.avisos ?? []), alarmeCoord]
      log(`ao vivo ${cliente} ${data}: ${alarmeCoord}`)
    }
    const avisoErro = r.aviso ?? r.degradado ?? alarmeCoord
    for (const p of resultado.placas) {
      const pa = paradaAtualPorPlaca.get(normPlaca(p.placa))
      if (!pa) continue
      // Sem rastreador no dia (06/10, TOS0H81: GPS parado havia 23 h): a
      // "parada" e' a ultima posicao velha, nao o carro no cliente agora.
      if (p.nfs.length > 0 && p.nfs.every(n => n.situacao === 'sem_rastreador')) continue
      // Rota acabou (06/10: RQM4C16 6/6 parado em casa, RBJ7H78 parado no patio
      // depois de voltar): sem nota pendente, ou a parada comecou depois da
      // volta a base -- nao e' "no cliente".
      if (!p.nfs.some(n => n.situacao === 'pendente')) continue
      if (p.chegadaBase && Date.parse(pa.inicio) >= Date.parse(p.chegadaBase)) continue
      const n = pa.lat != null && pa.lng != null ? nfProxima(p.nfs, { lat: pa.lat, lng: pa.lng }) : null
      p.paradaAtual = { inicio: pa.inicio, nf: n?.nf ?? null, cliente: n?.cliente ?? null }
    }
    const { error } = await svc.from('kpi_ao_vivo_calculo').update({
      resultado, calculado_em: resultado.calculadoEm, duracao_ms: Date.now() - t0, rodando_desde: null,
      // F1-11: mesmo instante do calculo (a tela nao mostra "o calculo falhou"
      // e o tick sabe que ESTE calculo saiu sem a conferencia).
      ...(avisoErro ? { ultimo_erro: avisoErro.slice(0, 500), ultimo_erro_em: resultado.calculadoEm } : {}),
    }).eq('cliente', cliente).eq('data', data)
    if (error) throw new Error(error.message)
    log(`ao vivo ${cliente} ${data}: ok em ${Math.round((Date.now() - t0) / 1000)}s (${resultado.resumo.feitas}/${resultado.resumo.totalNfs})`)
    return 'ok'
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log(`ao vivo ${cliente} ${data}: ERRO ${msg}`)
    await svc.from('kpi_ao_vivo_calculo').update({ ultimo_erro: msg.slice(0, 500), ultimo_erro_em: new Date().toISOString(), rodando_desde: null }).eq('cliente', cliente).eq('data', data)
    return 'erro'
  }
}
