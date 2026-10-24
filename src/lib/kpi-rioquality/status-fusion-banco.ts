// F2-05: status da sincronizacao com a Fusion gravado por dia em
// kpi_cache_dia (tabela que ja' existe, guardada 7 dias pela limpeza das
// 04h; sem migration). Fail-open: falha de leitura/gravacao nunca derruba o
// tick nem a tela.
import { createServiceClient } from '@/lib/supabase/service'
import { proximoStatusFusion, type EventoSyncFusion, type StatusFusion } from './status-fusion'

type ClienteStatus = Pick<ReturnType<typeof createServiceClient>, 'from'>
type Opcoes = { cliente?: () => ClienteStatus }

export const chaveStatusFusion = (data: string) => `fusion-sync:rioquality:${data}`

const logErro = (o: string, err: unknown) =>
  console.error(`${new Date().toISOString()} [kpi-rioquality/status-fusion] ${o} falhou:`, err instanceof Error ? err.message : err)

export async function lerStatusFusion(data: string, opcoes: Opcoes = {}): Promise<StatusFusion | null> {
  try {
    const { data: linha, error } = await (opcoes.cliente ?? createServiceClient)().from('kpi_cache_dia')
      .select('valor').eq('chave', chaveStatusFusion(data)).maybeSingle()
    if (error) throw new Error(error.message)
    return ((linha as { valor?: StatusFusion } | null)?.valor) ?? null
  } catch (err) {
    logErro('leitura', err)
    return null
  }
}

export async function gravarStatusFusion(data: string, status: StatusFusion, opcoes: Opcoes = {}): Promise<boolean> {
  try {
    const { error } = await (opcoes.cliente ?? createServiceClient)().from('kpi_cache_dia')
      .upsert({ chave: chaveStatusFusion(data), data, valor: status, gravado_em: new Date().toISOString() }, { onConflict: 'chave' })
    if (error) throw new Error(error.message)
    return true
  } catch (err) {
    logErro('gravação', err)
    return false
  }
}

/** Registra uma tentativa (tick, fechamento ou o botao da tela). */
export async function registrarSyncFusion(data: string, ev: EventoSyncFusion, opcoes: Opcoes = {}): Promise<StatusFusion | null> {
  try {
    const novo = proximoStatusFusion(await lerStatusFusion(data, opcoes), ev)
    return (await gravarStatusFusion(data, novo, opcoes)) ? novo : null
  } catch (err) {
    logErro('registro', err)
    return null
  }
}
