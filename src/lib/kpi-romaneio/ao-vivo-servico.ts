// KPI ao vivo: leitura/gravação no banco e o cálculo. O cálculo é a MESMA
// função da geração normal (gerarKpiNutrimax); a tela lê só o resultado
// gravado aqui, nunca recalcula por conta própria.
import { createServiceClient } from '@/lib/supabase/service'
import { gerarKpiNutrimax, type EntradaKpiNutrimax } from './gerar-nutrimax'
import { extrairKpiCompleto } from './resumo-dashboard'
import { resumirPlacas, paradaDaChegada, type PlacaAoVivo } from './ao-vivo'
import { normPlaca } from '@/lib/unitrac-api'
import type { LinhaEscala, LinhaRomaneio } from './types'

export const CLIENTES_AO_VIVO = ['nutrimax'] as const
export type ClienteAoVivo = (typeof CLIENTES_AO_VIVO)[number]
export const clienteAoVivoValido = (c: string | null): c is ClienteAoVivo => (CLIENTES_AO_VIVO as readonly string[]).includes(c ?? '')

/** Cálculo travado há mais que isso é considerado morto (processo caiu). */
const TRAVA_EXPIRA_MIN = 15

export type ResultadoAoVivo = {
  calculadoEm: string
  resumo: { taxa: number | null; entregues: number | null; nfsNaConta: number | null; aguardando: number; totalNfs: number; feitas: number; pct: number }
  placas: PlacaAoVivo[]
}

export type DiaAoVivo = {
  enviadoEm: string
  enviadoPor: string | null
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

export async function guardarDiaAoVivo(p: {
  cliente: ClienteAoVivo
  data: string
  escala: LinhaEscala[]
  romaneio: LinhaRomaneio[]
  pao: { linhas: LinhaRomaneio[]; escala: LinhaEscala[] }
  escalaEnviada: boolean
  paoEnviado: boolean
  enviadoPor: string | null
}): Promise<void> {
  const { error } = await createServiceClient().from('kpi_ao_vivo_dia').upsert({
    cliente: p.cliente, data: p.data, romaneio: p.romaneio, escala: p.escala, pao: p.pao,
    escala_enviada: p.escalaEnviada, pao_enviado: p.paoEnviado, enviado_por: p.enviadoPor, enviado_em: new Date().toISOString(),
  }, { onConflict: 'cliente,data' })
  if (error) throw new Error(`guardar romaneio do dia: ${error.message}`)
}

export async function lerEstadoAoVivo(cliente: ClienteAoVivo, data: string): Promise<EstadoAoVivo> {
  const svc = createServiceClient()
  const [d, c] = await Promise.all([
    svc.from('kpi_ao_vivo_dia').select('romaneio, pao, escala_enviada, pao_enviado, enviado_por, enviado_em').eq('cliente', cliente).eq('data', data).maybeSingle(),
    svc.from('kpi_ao_vivo_calculo').select('resultado, ultimo_erro, ultimo_erro_em, rodando_desde').eq('cliente', cliente).eq('data', data).maybeSingle(),
  ])
  if (d.error) throw new Error(d.error.message)
  if (c.error) throw new Error(c.error.message)
  let dia: DiaAoVivo | null = null
  if (d.data) {
    const linhas = [...(d.data.romaneio as LinhaRomaneio[]), ...((d.data.pao as { linhas: LinhaRomaneio[] }).linhas ?? [])]
    dia = {
      enviadoEm: d.data.enviado_em as string,
      enviadoPor: (d.data.enviado_por as string | null) ?? null,
      nfs: linhas.length,
      placas: new Set(linhas.map(l => l.placa)).size,
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

/** Resultado da tela a partir da planilha do KPI lida (extrairKpiCompleto).
 *  Usado pelo cálculo ao vivo e pelo histórico (planilha guardada). */
export function montarResultadoAoVivo(data: string, lido: Awaited<ReturnType<typeof extrairKpiCompleto>>, coords: Map<string, { lat: number; lng: number }>, calculadoEm: string, paradas?: Map<string, { lat: number; lng: number }>): ResultadoAoVivo {
  const placas = resumirPlacas(data, lido.nfs, lido.resumo.cargas, coords, paradas)
  const totalNfs = placas.reduce((s, p) => s + p.total, 0)
  const feitas = placas.reduce((s, p) => s + p.feitas, 0)
  return {
    calculadoEm,
    resumo: {
      taxa: lido.resumo.taxa, entregues: lido.resumo.entregues, nfsNaConta: lido.resumo.nfsNaConta,
      aguardando: lido.resumo.aguardando ?? 0, totalNfs, feitas, pct: totalNfs ? Math.round((100 * feitas) / totalNfs) : 0,
    },
    placas,
  }
}

/** Roda o KPI com o romaneio guardado e grava o resultado da tela.
 *  Outro cálculo rodando: não faz nada ('ocupado'). Sem romaneio: 'sem_romaneio'. */
export async function calcularAoVivo(cliente: ClienteAoVivo, data: string, log: (m: string) => void = () => {}): Promise<'ok' | 'ocupado' | 'sem_romaneio' | 'erro'> {
  const entrada = await entradaDoDia(cliente, data)
  if (!entrada) return 'sem_romaneio'
  if (!(await travar(cliente, data))) return 'ocupado'
  const svc = createServiceClient()
  const t0 = Date.now()
  try {
    const coords = new Map<string, { lat: number; lng: number }>()
    const paradasNf = new Map<string, { lat: number; lng: number }>()
    const r = await gerarKpiNutrimax(entrada, {
      aoMontarDetalhe: ({ romaneioGeo, detalhe, paradasPorPlaca }) => {
        for (const l of romaneioGeo) if (l.lat != null && l.lng != null) coords.set(l.nf, { lat: l.lat, lng: l.lng })
        // Ponto da parada que o KPI contou como entrega ("Ver no monitoramento").
        for (const d of detalhe) {
          const p = paradaDaChegada(paradasPorPlaca.get(normPlaca(d.placa)) ?? [], d.chegada)
          if (p) paradasNf.set(d.nf, p)
        }
      },
    })
    const resultado = montarResultadoAoVivo(data, await extrairKpiCompleto(r.xlsx), coords, new Date().toISOString(), paradasNf)
    const { error } = await svc.from('kpi_ao_vivo_calculo').update({
      resultado, calculado_em: resultado.calculadoEm, duracao_ms: Date.now() - t0, rodando_desde: null,
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
