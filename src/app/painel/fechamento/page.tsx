import { getFechamento, MESES_FECHAMENTO } from '@/lib/kpi/fechamento-data'
import FechamentoClient from './fechamento-client'

export const runtime = 'nodejs'

// Auth + sidebar vêm do layout do /painel. Aqui só resolvemos o mês selecionado.
export default async function FechamentoPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams
  const d = getFechamento(sp.mes)
  return <FechamentoClient d={d} meses={MESES_FECHAMENTO} mesAtual={d.mes} />
}
