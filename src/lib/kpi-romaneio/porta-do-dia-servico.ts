// F3-05 (AC-13): ligações reais da porta do dia (banco, Ao vivo, monitoramento).
// A regra mora em porta-do-dia.ts (testada sem rede).
import { createServiceClient } from '@/lib/supabase/service'
import { guardarDiaAoVivo, calcularAoVivo, entradaRioQualityDoDia, type ClienteAoVivo } from './ao-vivo-servico'
import { enviarAoMonitoramento } from './enviar-monitoramento'
import { enviarRioQualityAoMonitoramento, linhasComCoordenadasRQ } from '@/lib/kpi-rioquality/enviar-monitoramento-rq'
import type { DiaGuardado } from './mesclar-envio'
import type { DepsPortaNutry, DepsPortaRQ, ResultadoPorta } from './porta-do-dia'

export const depsReaisPortaNutry: DepsPortaNutry = {
  async lerDia(data) {
    const { data: ja, error } = await createServiceClient().from('kpi_ao_vivo_dia')
      .select('romaneio, escala, pao, escala_enviada, pao_enviado').eq('cliente', 'nutrimax').eq('data', data).maybeSingle()
    if (error) throw new Error(`ao vivo do dia: ${error.message}`)
    if (!ja) return null
    return {
      romaneio: ja.romaneio as DiaGuardado['romaneio'], escala: (ja.escala as DiaGuardado['escala']) ?? [],
      pao: (ja.pao as DiaGuardado['pao']) ?? { linhas: [], escala: [] }, escalaEnviada: !!ja.escala_enviada, paoEnviado: !!ja.pao_enviado,
    }
  },
  async guardar(p) {
    await guardarDiaAoVivo({ cliente: 'nutrimax', data: p.data, escala: p.escala, romaneio: p.romaneio, pao: p.pao, escalaEnviada: p.escalaEnviada, paoEnviado: p.paoEnviado, enviadoPor: p.enviadoPor })
  },
  enviarMonitoramento: enviarAoMonitoramento,
}

export const depsReaisPortaRQ: DepsPortaRQ = {
  lerEntregas: entradaRioQualityDoDia,
  async guardar(data, entregas, enviadoPor) {
    await guardarDiaAoVivo({ cliente: 'rioquality', data, escala: [], romaneio: entregas, pao: { linhas: [], escala: [] }, escalaEnviada: false, paoEnviado: false, enviadoPor })
  },
  async enviarMonitoramento(data, entregas, enviadoPor) {
    return enviarRioQualityAoMonitoramento(data, await linhasComCoordenadasRQ(entregas), { enviadoPor })
  },
}

/** Depois da geração (geocode e paradas já em cache): o Ao vivo calcula o dia
 *  que acabou de receber, sem esperar o tick. A trava do cálculo evita rodar
 *  junto com o tick ('ocupado'). Só loga. */
export function depoisDaGeracao(cliente: ClienteAoVivo, data: string, porta: ResultadoPorta): void {
  if (porta.erro) console.error(`[kpi/porta-do-dia] ${cliente} ${data}: Ao vivo não recebeu a geração: ${porta.erro}`)
  for (const m of porta.monitoramento) if (!m.ok) console.error(`[kpi/porta-do-dia] ${cliente} ${data}: monitoramento (${m.origem}) falhou: ${m.erro}`)
  if (porta.aoVivo !== 'gravado') return
  void calcularAoVivo(cliente, data, m => console.log(`[kpi/ao-vivo] ${m}`)).catch(err => console.error('[kpi/ao-vivo] calculo falhou:', err))
}
