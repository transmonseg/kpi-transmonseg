// Cálculo do KPI ao vivo em segundo plano (spec 2026-10-06-kpi-ao-vivo-design.md).
// Cron a cada 10 min; só calcula das 05h às 21h (BRT) e só se o romaneio do
// dia foi subido. A trava no banco (calcularAoVivo) impede dois cálculos ao
// mesmo tempo, inclusive com o disparado pela tela ao subir o romaneio.
// Uso: npx tsx --env-file=.env.production scripts/kpi-ao-vivo-tick.ts
import { hojeBR } from '../src/lib/data-br'
import { CLIENTES_AO_VIVO, calcularAoVivo } from '../src/lib/kpi-romaneio/ao-vivo-servico'

async function main() {
  const horaBR = Number(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }))
  if (horaBR < 5 || horaBR >= 21) return
  const data = hojeBR()
  for (const cliente of CLIENTES_AO_VIVO) {
    const r = await calcularAoVivo(cliente, data, m => console.log(`${new Date().toISOString()} ${m}`))
    if (r !== 'ok') console.log(`${new Date().toISOString()} ao vivo ${cliente} ${data}: ${r}`)
  }
}

main().catch(err => {
  console.error(`${new Date().toISOString()} ERRO FATAL`, err)
  process.exit(1)
})
