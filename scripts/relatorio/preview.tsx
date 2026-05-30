import { config } from 'dotenv'
config({ path: '.env.local' })
import React from 'react'
import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'fs'
import { renderToBuffer } from '@react-pdf/renderer'
import { intervaloPeriodo, intervaloAnterior, carregarEntradasManuais } from '../../src/lib/kpi/dashboard-query'
import { calcularMetricas, filtrar } from '../../src/lib/kpi/dashboard-metricas'
import { montarNarrativa } from '../../src/lib/kpi/relatorio-narrativa'
import { Relatorio, type RelatorioCtx } from '../../src/lib/relatorio/Relatorio'

async function main() {
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const periodo = process.argv[2] ?? 'mes'
  const data = process.argv[3] ?? '2026-05-21'

  const intervalo = intervaloPeriodo(periodo, data)
  const [aIni, aFim] = intervaloAnterior(periodo, data)
  const atual = filtrar(await carregarEntradasManuais(svc, intervalo[0], intervalo[1]), { redes: [] })
  const anterior = filtrar(await carregarEntradasManuais(svc, aIni, aFim), { redes: [] })

  const m = calcularMetricas(atual)
  const ant = anterior.length ? calcularMetricas(anterior) : null
  const narrativa = montarNarrativa(m, ant, periodo, intervalo)

  const ctx: RelatorioCtx = { m, ant, periodo, intervalo, redes: [], narrativa, mes: data.slice(0, 7), geradoEm: '30/05/2026 18:00' }
  const buf = await renderToBuffer(React.createElement(Relatorio, { ctx }))

  mkdirSync('docs/backup', { recursive: true })
  const out = `docs/backup/relatorio-${periodo}-preview.pdf`
  writeFileSync(out, buf)
  console.log(`OK — ${out} · ${buf.length} bytes · período ${intervalo[0]}..${intervalo[1]} · ${m.total} entregas`)
}

main().catch(e => { console.error('ERRO:', e instanceof Error ? e.stack : e); process.exit(1) })
