import type { AlvoApi } from '@/lib/unitrac-api'

/** `/mapa_servicos/alvos` não recebe parâmetro de data -- devolve sempre o
 *  plano de entrega ATUAL da conta, não o de uma data específica. Pedir KPI
 *  de ontem enquanto a Unitrac já girou pro plano de hoje faria confirmar
 *  entregas de ontem com os alvos (NF) errados. Mesma correção que o
 *  gerador antigo já aplicava (`/api/kpi/nutrimax/gerar`, destruído na
 *  Task 1) -- descarta alvo cuja data (feito ou início) não bate com a
 *  data pedida, em vez de misturar dias silenciosamente.
 *
 *  LIMITE CONHECIDO (achado na revisão final, ainda não corrigido de
 *  propósito -- ver Fix 2 do relatório de correção pós-revisão): usa
 *  `feitoISO` quando existe, senão cai pra `inicioISO`. Isso significa que
 *  uma confirmação registrada DEPOIS da meia-noite (rota longa, entrega
 *  urgente que só termina de madrugada) grava `feitoISO` com a data de
 *  HOJE mesmo a carga sendo da rota de ONTEM -- pedir o KPI de ontem
 *  descarta esse alvo aqui, mesmo com `situacao === 1` (feito de verdade).
 *  Não corrigido agora porque não há dado real (Task 11, ainda não feita)
 *  que mostre se a correção certa é "olhar os dois campos e aceitar se
 *  QUALQUER um bater" ou outra coisa -- mudar esse filtro sem validação
 *  arrisca trocar "descarta alvo de ontem" por "mistura alvo do dia
 *  errado", que é o problema original que essa função existe pra evitar.
 *  Os testes deste arquivo documentam esse limite explicitamente. */
export function alvosDaData(alvos: AlvoApi[], data: string): AlvoApi[] {
  return alvos.filter(a => (a.feitoISO ?? a.inicioISO)?.slice(0, 10) === data)
}
