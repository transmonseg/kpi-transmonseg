// Cálculo do KPI ao vivo em segundo plano (spec 2026-10-06-kpi-ao-vivo-design.md).
// Cron a cada 10 min; só calcula das 05h às 21h (BRT) e só se o romaneio do
// dia foi subido. A trava no banco (calcularAoVivo) impede dois cálculos ao
// mesmo tempo, inclusive com o disparado pela tela ao subir o romaneio.
// Fechamento (05/10): depois da meia-noite, o dia anterior ganha um último
// cálculo já com o dia encerrado -- sem isso as NFs que estavam "aguardando
// fim da rota" no último cálculo do dia ficavam pendentes pra sempre.
// Uso: npx tsx --env-file=.env.production scripts/kpi-ao-vivo-tick.ts
import { hojeBR } from '../src/lib/data-br'
import { createServiceClient } from '../src/lib/supabase/service'
import { CLIENTES_AO_VIVO, calcularAoVivo } from '../src/lib/kpi-romaneio/ao-vivo-servico'
import { diaAnterior, precisaFecharDia } from '../src/lib/kpi-romaneio/ao-vivo'
import { limparCacheDia } from '../src/lib/kpi-romaneio/cache-dia'
import { limparXlsxAoVivo } from '../src/lib/kpi-romaneio/ao-vivo-servico'

const log = (m: string) => console.log(`${new Date().toISOString()} ${m}`)

async function fecharDiaAnterior() {
  const ontem = diaAnterior(hojeBR())
  for (const cliente of CLIENTES_AO_VIVO) {
    const { data } = await createServiceClient().from('kpi_ao_vivo_calculo').select('calculado_em').eq('cliente', cliente).eq('data', ontem).maybeSingle()
    if (!precisaFecharDia((data?.calculado_em as string | null) ?? null, ontem, Date.now())) continue
    log(`ao vivo ${cliente} ${ontem}: fechamento do dia`)
    const r = await calcularAoVivo(cliente, ontem, log)
    if (r !== 'ok') log(`ao vivo ${cliente} ${ontem} (fechamento): ${r}`)
  }
}

async function main() {
  await fecharDiaAnterior()
  const horaBR = Number(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }))
  // Limpeza 1x por dia (04h BRT, 1o tick da hora): cache do dia e planilhas
  // do ao vivo com mais de 7 dias -- nada acumula no servidor.
  if (horaBR === 4 && new Date().getMinutes() < 10) {
    await limparCacheDia(hojeBR()).catch(err => log(`limpeza cache: ${err}`))
    await limparXlsxAoVivo(hojeBR()).catch(err => log(`limpeza planilhas ao vivo: ${err}`))
    log('limpeza diaria feita')
  }
  if (horaBR < 5 || horaBR >= 21) return
  const data = hojeBR()
  for (const cliente of CLIENTES_AO_VIVO) {
    const r = await calcularAoVivo(cliente, data, log)
    if (r !== 'ok') log(`ao vivo ${cliente} ${data}: ${r}`)
  }
}

main().catch(err => {
  console.error(`${new Date().toISOString()} ERRO FATAL`, err)
  process.exit(1)
})
